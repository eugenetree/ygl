/* global console, process */
import { Client } from '@elastic/elasticsearch';
import elasticsearchMapping from './elasticsearch_mapping.json' assert { type: 'json' };

const client = new Client({ 
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' 
});

async function initializeIndex() {
  const indexName = 'video_captions';
  
  try {
    // Check if index exists
    const exists = await client.indices.exists({ index: indexName });
    
    if (exists) {
      console.log(`Index ${indexName} already exists. Deleting...`);
      await client.indices.delete({ index: indexName });
    }
    
    // Create index with mapping
    console.log(`Creating index ${indexName}...`);
    await client.indices.create({
      index: indexName,
      body: elasticsearchMapping
    });
    
    console.log('Index created successfully!');
    console.log('Mapping:', JSON.stringify(elasticsearchMapping, null, 2));
    
  } catch (error) {
    console.error('Error initializing index:', error);
    process.exit(1);
  }
}

// Run initialization
initializeIndex().then(() => {
  console.log('Elasticsearch index initialization complete');
  process.exit(0);
}).catch(error => {
  console.error('Failed to initialize index:', error);
  process.exit(1);
}); 