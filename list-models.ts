import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

console.log('🔍 Listing available Gemini models...\n');

genAI.listModels()
  .then(models => {
    console.log('Available models:');
    models.forEach((model, i) => {
      console.log(`\n${i + 1}. ${model.name}`);
      console.log(`   Display Name: ${model.displayName}`);
      console.log(`   Supported Methods: ${model.supportedGenerationMethods?.join(', ')}`);
    });
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
