
import { IRequest, Router } from 'itty-router';
import { nanoid } from 'nanoid';
import { createSite, deleteSite, listSites, getSiteByUrl, updateSiteLastScrapedAt } from '@/models/site';
import { createDocument } from '@/models/document';
import { requireAuth } from '@/helpers/auth';

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
async function scrapeAndIngest(url: string, env: Env): Promise<boolean> {
  try {
    console.log(`Attempting to scrape: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.statusText}`);
      return false;
    }
    const html = await response.text();

    // Basic content extraction (can be improved with a proper parser)
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : url;
    const content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]*>/g, '')
                        .replace(/\s+/g, ' ').trim();

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
    return false;
  }
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

    return new Response(`Site ${url} added successfully`, { status: 200 });
  } catch (error) {
    console.error('Error adding site:', error);
    return new Response('Unauthorized', { status: 401 });
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
    return new Response(`Site ${url} removed successfully`, { status: 200 });
  } catch (error) {
    console.error('Error removing site:', error);
    return new Response('Unauthorized', { status: 401 });
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
    return new Response('Unauthorized', { status: 401 });
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

    const results = await Promise.all(scrapingPromises);

    return new Response(JSON.stringify({ message: 'Scraping initiated', results }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error initiating scraping:', error);
    return new Response('Unauthorized', { status: 401 });
  }
});

export default router;
