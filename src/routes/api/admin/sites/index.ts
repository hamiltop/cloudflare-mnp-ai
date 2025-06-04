
import { IRequest, Router } from 'itty-router';

const router = Router();

// In-memory store for sites (for demonstration purposes)
// In a real application, this would be a database
let sites: string[] = [];

// Helper function to validate URL
const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
};

// Add a new site for scraping
router.post('/api/admin/sites/add', async (request: IRequest) => {
  const { url } = await request.json();

  if (!url || !isValidUrl(url)) {
    return new Response('Invalid URL provided', { status: 400 });
  }

  if (sites.includes(url)) {
    return new Response('Site already exists', { status: 409 });
  }

  sites.push(url);
  // TODO: Implement actual scraping logic here
  // For now, just simulate success
  console.log(`Added site for scraping: ${url}`);

  return new Response(`Site ${url} added successfully`, { status: 200 });
});

// Remove a site
router.post('/api/admin/sites/remove', async (request: IRequest) => {
  const { url } = await request.json();

  if (!url || !isValidUrl(url)) {
    return new Response('Invalid URL provided', { status: 400 });
  }

  const initialLength = sites.length;
  sites = sites.filter(site => site !== url);

  if (sites.length === initialLength) {
    return new Response('Site not found', { status: 404 });
  }

  console.log(`Removed site: ${url}`);
  return new Response(`Site ${url} removed successfully`, { status: 200 });
});

// List all managed sites
router.get('/api/admin/sites/list', async () => {
  return new Response(JSON.stringify(sites), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});

// Trigger scraping for a specific site or all sites
router.post('/api/admin/sites/scrape', async (request: IRequest) => {
  const { url } = await request.json();

  if (url && !isValidUrl(url)) {
    return new Response('Invalid URL provided', { status: 400 });
  }

  let sitesToScrape = url ? [url] : sites;

  if (sitesToScrape.length === 0) {
    return new Response('No sites to scrape', { status: 404 });
  }

  // TODO: Implement robust scraping and ingestion logic
  // This is a placeholder for the actual scraping process
  const scrapingPromises = sitesToScrape.map(async (siteUrl) => {
    console.log(`Initiating scraping for: ${siteUrl}`);
    // Simulate async scraping
    await new Promise(resolve => setTimeout(resolve, 1000));
    // TODO: Add error handling, progress tracking, and content normalization
    return { url: siteUrl, status: 'initiated' };
  });

  const results = await Promise.all(scrapingPromises);

  return new Response(JSON.stringify({ message: 'Scraping initiated', results }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});

export default router;
