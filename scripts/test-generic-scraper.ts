import 'dotenv/config';
import { scrapeGenericProduct } from '../server/services/generic-brand-scraper.service';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';

puppeteer.use(StealthPlugin());

type TestCase = {
  label: string;
  websiteUrl: string;
  styleNumber: string;
  productName?: string;
  color?: string;
  headlessUrl?: string;
  selectors?: {
    name?: string[];
    price?: string[];
    description?: string[];
  };
};

const testCases: TestCase[] = [
  {
    label: 'Ethika – Staple Happy Daze',
    websiteUrl: 'https://www.ethika.com',
    styleNumber: 'staple-happy-daze',
    productName: 'Staple Happy Daze',
    color: 'Happy Daze',
    headlessUrl: 'https://www.ethika.com/products/staple-happy-daze',
    selectors: {
      name: ['h1', '[data-product-title]'],
      price: ['[data-product-price]', '.ProductPrice'],
      description: ['[data-product-description]', '.ProductDescription'],
    },
  },
  {
    label: 'True Religion – Joey Bootcut Jean',
    websiteUrl: 'https://www.truereligion.com',
    styleNumber: 'joey-bootcut-jean',
    productName: 'Joey Bootcut Jean',
    color: 'Light Wash',
    headlessUrl: 'https://www.truereligion.com/products/joey-bootcut-jean',
    selectors: {
      name: ['h1.product-name', 'h1'],
      price: ['.price-sales', '.product-pricing .value'],
      description: ['#product-content', '.product-accordion__panel-inner'],
    },
  },
];

const MIN_DELAY_MS = parseInt(process.env.SCRAPER_GENERIC_MIN_DELAY_MS ?? process.env.SCRAPER_MIN_DELAY_MS ?? '2000', 10);
const MAX_DELAY_MS = parseInt(process.env.SCRAPER_GENERIC_MAX_DELAY_MS ?? process.env.SCRAPER_MAX_DELAY_MS ?? '5000', 10);
const HEADLESS_ENABLED = process.env.SCRAPER_HEADLESS === '1';

function randomDelay(): Promise<void> {
  const delay = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
  return new Promise(resolve => setTimeout(resolve, delay));
}

type HeadlessResult = {
  name?: string;
  price?: string;
  description?: string;
  error?: string;
  finalUrl?: string;
};

async function scrapeProductWithHeadless(url: string, selectors?: TestCase['selectors']): Promise<HeadlessResult> {
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800',
      ],
      defaultViewport: {
        width: 1280,
        height: 800,
      },
    });

    const page: Page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.google.com/',
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await randomDelay();

    const extractText = async (candidates: string[] | undefined) => {
      if (!candidates || candidates.length === 0) return '';
      return page.evaluate((sels: string[]) => {
        for (const sel of sels) {
          const el = document.querySelector(sel);
          const text = el?.textContent?.trim();
          if (text) return text;
        }
        return '';
      }, candidates);
    };

    const name = await extractText(selectors?.name ?? ['h1', '[data-product-title]']);
    const price = await extractText(selectors?.price ?? ['.price', '.product-price', '[data-product-price]']);
    const description = await extractText(selectors?.description ?? ['.product-description', '[data-product-description]']);

    if (!name) {
      throw new Error('Product title not found after rendering');
    }

    return {
      name,
      price,
      description,
      finalUrl: page.url(),
    };
  } catch (error) {
    return { error: (error as Error).message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function run() {
  for (const testCase of testCases) {
    const { label, websiteUrl, headlessUrl, selectors, ...searchCriteria } = testCase;
    console.log('\n==============================');
    console.log(`Running generic scrape: ${label}`);
    console.log('Search criteria:', searchCriteria);

    const result = await scrapeGenericProduct(websiteUrl, searchCriteria);

    if (!result.scrapingSuccess) {
      console.error('❌ Generic scrape failed:', result.scrapingError);
      if (HEADLESS_ENABLED && headlessUrl) {
        console.log('⚙️  Attempting headless fallback…');
        const headlessData = await scrapeProductWithHeadless(headlessUrl, selectors);
        if (headlessData.error) {
          console.error('❌ Headless scrape failed:', headlessData.error);
        } else {
          console.log('✅ Headless scrape succeeded');
          console.log('Final URL:', headlessData.finalUrl);
          console.log('Name:', headlessData.name);
          console.log('Price:', headlessData.price || '—');
          console.log('Description preview:', headlessData.description?.slice(0, 160) || '—');
        }
      }
      continue;
    }

    console.log('✅ Scrape succeeded');
    console.log('Brand URL:', result.brandProductUrl);
    console.log('Title:', result.brandProductTitle || result.productName);
    console.log('Description preview:', result.brandDescription?.slice(0, 120) || '—');
    console.log('Features:', result.features.length);
    console.log('Images:', result.images.length);
    console.log('Variants:', result.variants.length);
    if (result.sizeChartImageUrl) {
      console.log('Size Chart Image:', result.sizeChartImageUrl);
    }
  }
}

run().catch((error) => {
  console.error('Test runner failed:', error);
  process.exitCode = 1;
});
