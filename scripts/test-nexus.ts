import { scrapeGenericProduct } from '../server/services/generic-brand-scraper.service';

async function main() {
  const result = await scrapeGenericProduct('https://nexusclothing.com', {
    styleNumber: 'beast-men-darkness-tee-royal-blue',
    productName: 'Beast Men Darkness Tee (Royal Blue)',
    color: 'Royal Blue',
  });

  if (!result.scrapingSuccess) {
    console.error('Scrape failed:', result.scrapingError);
    process.exitCode = 1;
    return;
  }

  console.log('Scrape succeeded');
  console.log('Title:', result.brandProductTitle);
  console.log('URL:', result.brandProductUrl);
  console.log('Description preview:', result.brandDescription.slice(0, 160));
  console.log('Variants:', result.variants.length);
  console.log('Images:', result.images.length);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
