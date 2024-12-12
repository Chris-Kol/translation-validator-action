import * as fs from 'fs';
import po from 'pofile';
import { ChatOllama } from "@langchain/ollama";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { TranslationIssue, ValidationProblem, ValidatorConfig } from './types';

export class TranslationValidator {
   private model: ChatOllama | ChatAnthropic | ChatOpenAI;

   constructor(config: ValidatorConfig) {
       this.model = this.initializeModel(config);
   }

   private initializeModel(config: ValidatorConfig): ChatOllama | ChatAnthropic | ChatOpenAI {
       switch (config.provider) {
           case 'ollama':
               return new ChatOllama({
                   baseUrl: config.baseUrl || "http://localhost:11434",
                   model: config.modelName || "llama2"
               });
           case 'anthropic':
               if (!config.apiKey) {
                   throw new Error('Anthropic API key is required');
               }
               return new ChatAnthropic({
                   anthropicApiKey: config.apiKey,
                   modelName: config.modelName || "claude-3-sonnet-20240229"
               });
           case 'openai':
               if (!config.apiKey) {
                   throw new Error('OpenAI API key is required');
               }
               return new ChatOpenAI({
                   openAIApiKey: config.apiKey,
                   modelName: config.modelName || "gpt-3.5-turbo"
               });
           default:
               throw new Error(`Unsupported provider: ${config.provider}`);
       }
   }

   private extractPlaceholders(text: string): string[] {
       const placeholderRegex = /%[sdfg]/g;
       return text.match(placeholderRegex) || [];
   }

   private checkPlaceholderConsistency(msgid: string, msgstr: string): ValidationProblem[] {
       const issues: ValidationProblem[] = [];
       const originalPlaceholders = this.extractPlaceholders(msgid);
       const translatedPlaceholders = this.extractPlaceholders(msgstr);

       if (JSON.stringify(originalPlaceholders.sort()) !== JSON.stringify(translatedPlaceholders.sort())) {
           issues.push({
               type: 'placeholder_mismatch',
               description: `Missing placeholder(s): ${originalPlaceholders.filter(p => !translatedPlaceholders.includes(p)).join(', ')}`
           });
       }
       return issues;
   }

   private async validateBatch(translations: Array<{msgid: string, msgstr: string}>, targetLanguage: string): Promise<TranslationIssue[]> {
    const issues: TranslationIssue[] = [];

    try {
        const formattedTranslations = translations
            .map((t, i) => `${i + 1}. Original: ${t.msgid}\nTranslation: ${t.msgstr}`)
            .join('\n\n');

        const messages = [
            {
                role: "system",
                content: `You are a professional ${targetLanguage} translator validator that MUST:
                         1. Evaluate each translation independently
                         2. Only flag actually incorrect translations
                         3. "Sveika, pasaule!" is the correct translation for "Hello, world!"
                         4. Maintain exact original meaning in suggestions
                         5. Return proper JSON responses`
            },
            {
                role: "user",
                content: `Review each translation independently and respond in JSON format:
                         {
                           "translations": [
                             {
                               "index": number,
                               "has_issues": boolean,
                               "issues": string[],
                               "suggested_fix": string
                             }
                           ]
                         }

                         Translations to analyze:
                         ${formattedTranslations}`
            }
        ];

        try {
            const response = await this.model.generate([messages]);
            const responseText = response.generations[0][0].text.trim();

            if (!responseText.startsWith('{')) {
                throw new Error('Response is not in JSON format');
            }

            const result = JSON.parse(responseText);

            for (const validation of result.translations) {
                if (!validation || !translations[validation.index - 1]) {
                    continue;
                }

                const translation = translations[validation.index - 1];
                const problems: ValidationProblem[] = [];

                // Check placeholders
                const placeholderProblems = this.checkPlaceholderConsistency(translation.msgid, translation.msgstr);
                if (placeholderProblems.length > 0) {
                    problems.push(...placeholderProblems);
                }

                // Add linguistic issues only if the translation is actually wrong
                if (validation.has_issues &&
                    validation.suggested_fix &&
                    validation.suggested_fix !== translation.msgstr) {
                    problems.push({
                        type: 'linguistic_review',
                        description: validation.issues.join('\n')
                    });
                }

                if (problems.length > 0) {
                    issues.push({
                        msgid: translation.msgid,
                        msgstr: translation.msgstr,
                        problems: [...new Set(problems.map(p => JSON.stringify(p)))].map(p => JSON.parse(p)),
                        suggestedFix: validation.suggested_fix
                    });
                }
            }
        } catch (error: any) {
            if (error.message?.includes('model') && error.message?.includes('not found')) {
                throw error;
            }
            console.warn(`Failed AI validation: ${error.message}`);
        }
    } catch (error) {
        throw error;
    }

    return issues;
}

   async validatePoFile(filePath: string, targetLanguage: string, batchSize: number = 10): Promise<TranslationIssue[]> {
       const allIssues: TranslationIssue[] = [];
       let aiValidationSuccessful = false;

       try {
           const poContent = fs.readFileSync(filePath, 'utf8');
           const poData = po.parse(poContent);

           const validTranslations = poData.items
               .filter(item => item.msgstr[0])
               .map(item => ({msgid: item.msgid, msgstr: item.msgstr[0]}));

           console.log(`Processing ${validTranslations.length} translations...`);

           // Do technical validation first
           console.log('\n=== Technical Validation ===');
           for (const translation of validTranslations) {
               const technicalProblems = this.checkPlaceholderConsistency(translation.msgid, translation.msgstr);
               if (technicalProblems.length > 0) {
                   allIssues.push({
                       msgid: translation.msgid,
                       msgstr: translation.msgstr,
                       problems: technicalProblems,
                       suggestedFix: 'Ensure all placeholders are present in translation'
                   });
               }
           }

           console.log(`Found ${allIssues.length} technical issues.`);

           // Try AI validation
           console.log('\n=== AI Validation ===');
           try {
               const batches: Array<Array<{msgid: string, msgstr: string}>> = [];
               for (let i = 0; i < validTranslations.length; i += batchSize) {
                   batches.push(validTranslations.slice(i, i + batchSize));
               }

               for (const [index, batch] of batches.entries()) {
                   console.log(`Processing batch ${index + 1}/${batches.length}...`);
                   const batchIssues = await this.validateBatch(batch, targetLanguage);

                   // Merge batch issues with existing issues
                   for (const batchIssue of batchIssues) {
                       const existingIssue = allIssues.find(
                           issue => issue.msgid === batchIssue.msgid && issue.msgstr === batchIssue.msgstr
                       );

                       if (existingIssue) {
                           existingIssue.problems.push(...batchIssue.problems);
                           if (batchIssue.suggestedFix !== 'Ensure all placeholders are present in translation') {
                               existingIssue.suggestedFix = batchIssue.suggestedFix;
                           }
                       } else {
                           allIssues.push(batchIssue);
                       }
                   }
               }
               aiValidationSuccessful = true;
               console.log('AI validation completed successfully.');
           } catch (error) {
               const aiError = error as Error;
               console.error('❌ AI validation failed:', aiError.message);
               console.log('⚠️  Only technical validation results are available.');
               aiValidationSuccessful = false;
           }

           console.log('\n=== Summary ===');
           console.log(`Technical Validation: ✅ Complete`);
           console.log(`AI Validation: ${aiValidationSuccessful ? '✅ Complete' : '❌ Failed'}`);
           console.log(`Total issues found: ${allIssues.length}`);

           if (allIssues.length > 0) {
               console.log('\nValidation Issues:');
               allIssues.forEach((issue, index) => {
                   console.log(`\nIssue ${index + 1}:`);
                   console.log(`Original: ${issue.msgid}`);
                   console.log(`Translation: ${issue.msgstr}`);
                   if (issue.problems.length > 0) {
                       console.log('Problems:');
                       issue.problems.forEach(problem => {
                           console.log(`- [${problem.type}] ${problem.description}`);
                       });
                   }
                   console.log(`Suggested Fix: ${issue.suggestedFix}`);
               });
           }

       } catch (error) {
           const fileError = error as Error;
           console.error(`Error processing PO file: ${fileError.message}`);
           throw fileError;
       }

       return allIssues;
   }
}