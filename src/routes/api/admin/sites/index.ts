
import { IRequest, Router } from 'itty-router';
import { nanoid } from 'nanoid';
import { createSite, deleteSite, listSites, getSiteByUrl, updateSiteLastScrapedAt } from '@/models/site';
import { createDocument } from '@/models/document';
import { requireAuth } from '@/helpers/auth';
import * as cheerio from 'cheerio';

const router = Router();

// Helper function to validate URL
const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
};

// Helper function for scraping (placeholder for actual implementation)
async function scrapeAndIngest(url: string, env: Env, retries = 3): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting to scrape: ${url} (Attempt ${i + 1}/${retries})`);
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ${url}: ${response.statusText}`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Exponential backoff
          continue;
        }
        return false;
      }
      const html = await response.text();

      const $ = cheerio.load(html);
      const title = $('title').text() || url;

      // Extract content from common tags, filter out empty strings, and join with newlines
      const content = $('p, h1, h2, h3, h4, h5, h6, li')
        .map((i, el) => $(el).text().trim())
        .get()
        .filter(text => text.length > 0)
        .join('\n\n');

      if (content.length === 0) {
        console.warn(`No content extracted from ${url}`);
        return false;
      }

      await createDocument(env, {
        id: nanoid(),
        title: `Scraped: ${title}`,
        content: content,
        drive_file_id: null,
        drive_id: null,
        drive_file_modified_at: null,
      });

      console.log(`Successfully scraped and ingested: ${url}`);
      return true;
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Exponential backoff
        continue;
      }
      return false;
    }
  }
  return false; // Should not reach here if retries are exhausted
}

// Add a new site for scraping
router.post('/api/admin/sites/add', async (request: IRequest, env: Env) => {
  try {
    await requireAuth(request, env);
    const { url } = await request.json();

    if (!url || !isValidUrl(url)) {
      return new Response('Invalid URL provided', { status: 400 });
    }

    const existingSite = await getSiteByUrl(env, url);
    if (existingSite) {
      return new Response('Site already exists', { status: 409 });
    }

    await createSite(env, { id: nanoid(), url });
    console.log(`Added site for scraping: ${url}`);

    return new Response(JSON.stringify({ message: `Site ${url} added successfully` }), { status: 200 });
  } catch (error) {
    console.error('Error adding site:', error);
    if (error.message === 'Unauthorized') {
      return new Response('Unauthorized', { status: 401 });
    }
    return new Response('Error adding site', { status: 500 });
  }
});

// Remove a site
router.post('/api/admin/sites/remove', async (request: IRequest, env: Env) => {
  try {
    await requireAuth(request, env);
    const { url } = await request.json();

    if (!url || !isValidUrl(url)) {
      return new Response('Invalid URL provided', { status: 400 });
    }

    const siteToRemove = await getSiteByUrl(env, url);
    if (!siteToRemove) {
      return new Response('Site not found', { status: 404 });
    }

    await deleteSite(env, siteToRemove.id);
    console.log(`Removed site: ${url}`);
    return new Response(JSON.stringify({ message: `Site ${url} removed successfully` }), { status: 200 });
  } catch (error) {
    console.error('Error removing site:', error);
    if (error.message === 'Unauthorized') {
      return new Response('Unauthorized', { status: 401 });
    }
    return new Response('Error removing site', { status: 500 });
  }
});

// List all managed sites
router.get('/api/admin/sites/list', async (request: IRequest, env: Env) => {
  try {
    await requireAuth(request, env);
    const sites = await listSites(env);
    return new Response(JSON.stringify(sites), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error listing sites:', error);
    if (error.message === 'Unauthorized') {
      return new Response('Unauthorized', { status: 401 });
    }
    return new Response('Error listing sites', { status: 500 });
  }
});

// Trigger scraping for a specific site or all sites
router.post('/api/admin/sites/scrape', async (request: IRequest, env: Env) => {
  try {
    await requireAuth(request, env);
    const { url } = await request.json();

    if (url && !isValidUrl(url)) {
      return new Response('Invalid URL provided', { status: 400 });
    }

    let sitesToScrape = [];
    if (url) {
      const site = await getSiteByUrl(env, url);
      if (site) {
        sitesToScrape.push(site);
      } else {
        return new Response('Site not found for scraping', { status: 404 });
      }
    } else {
      sitesToScrape = await listSites(env);
    }

    if (sitesToScrape.length === 0) {
      return new Response('No sites to scrape', { status: 404 });
    }

    const scrapingPromises = sitesToScrape.map(async (site) => {
      const success = await scrapeAndIngest(site.url, env);
      if (success) {
        await updateSiteLastScrapedAt(env, site.id);
      }
      return { url: site.url, status: success ? 'completed' : 'failed' };
    });

    const results = await Promise.allSettled(scrapingPromises);

    const successfulScrapes = results.filter(result => result.status === 'fulfilled' && result.value.status === 'completed').map(result => (result as PromiseFulfilledResult<{ url: string, status: string }>).value);
    const failedScrapes = results.filter(result => result.status === 'fulfilled' && result.value.status === 'failed').map(result => (result as PromiseFulfilledResult<{ url: string, status: string }>).value);
    const rejectedScrapes = results.filter(result => result.status === 'rejected').map(result => ({ url: 'unknown', status: 'rejected', reason: (result as PromiseRejectedResult).reason }));


    return new Response(JSON.stringify({
      message: 'Scraping process completed',
      successful: successfulScrapes,
      failed: failedScrapes,
      errors: rejectedScrapes,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error initiating scraping:', error);
    if (error.message === 'Unauthorized') {
      return new Response('Unauthorized', { status: 401 });
    }
    return new Response('Error initiating scraping', { status: 500 });
  }
});

export default router;
