# Translation Validator Action

A GitHub Action that validates translations in PO files using both technical and AI-powered checks to identify issues like missing placeholders and incorrect translations. Built with support for multiple AI providers (Ollama, OpenAI, Anthropic).

## Features

- Technical validation checks:
 - Placeholder consistency (%s, %d, etc.)
 - Format verification
- Multiple AI provider support:
 - Ollama (local models)
 - OpenAI
 - Anthropic
- Batch processing for efficient api calls
- Detailed issue reporting
- GitHub Actions integration

## Installation

```bash
# Install dependencies
npm install

# Build
npm run build

# Package
npm run package
```

## Usage
- Local Testing

    You can run the existing test files with
    ```bash
    npm run test
    ```
    or you can create yours:

    1. Create a `.po` file for testing:
        ```
        msgid "Welcome to the learning path %s."
        msgstr "Mācību ceļa nosaukums"

        msgid "Hello, world!"
        msgstr "Sveika, pasaule!"

        msgid "You have completed %d courses"
        msgstr "Tu esi pabeidzis %d kursus"
        ```
    2. Create a script to run validation
        ```
        // Example using Ollama
        const validator = new TranslationValidator({
            provider: 'ollama',
            modelName: 'llama2',
            baseUrl: 'http://localhost:11434'
        });

        const issues = await validator.validatePoFile('test/sample.po', 'Latvian');
        ```
- GitHub Action Usage
    // TODO

## Configuration
### Provider Options
- Ollama:
```
{
    provider: 'ollama',
    modelName: 'llama2',
    baseUrl: 'http://localhost:11434'
}
```

- OpenAI:
```
{
    provider: 'openai',
    apiKey: 'your-api-key',
    modelName: 'gpt-3.5-turbo'
}
```

- Anthropic:
```
{
    provider: 'anthropic',
    apiKey: 'your-api-key',
    modelName: 'claude-3-sonnet-20240229'
}
```

WIP

License
MIT License