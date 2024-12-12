import { TranslationValidator } from '../src/validator';
import * as path from 'path';

async function testValidator() {
    try {
        const validator = new TranslationValidator({
            provider: 'ollama',
            modelName: 'llama2',
            baseUrl: 'http://localhost:11434'
        });

        const poFilePath = path.join(__dirname, 'sample.po');

        console.log('Starting validation...');
        await validator.validatePoFile(poFilePath, 'Latvian', 2);
    } catch (error) {
        console.error('Error:', error);
    }
}

testValidator();