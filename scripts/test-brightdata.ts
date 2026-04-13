// Test script for Bright Data ChatGPT scraper
// Usage: BRIGHTDATA_API_KEY=your_key npx tsx scripts/test-brightdata.ts

async function main() {
  const API_KEY = process.env.BRIGHTDATA_API_KEY
  if (!API_KEY) {
    console.error('Set BRIGHTDATA_API_KEY env var')
    process.exit(1)
  }

  const PROMPT = process.argv[2] ?? 'What are the best project management tools for software engineering teams?'

  console.log(`Sending prompt: "${PROMPT}"\n`)

  const start = Date.now()

  const res = await fetch(
    'https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_m7aof0k82r803d5bjm&format=json',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        { url: 'https://chatgpt.com/', prompt: PROMPT }
      ]),
    }
  )

  console.log(`Status: ${res.status} (${Date.now() - start}ms)\n`)

  const data = await res.json()

  if (!res.ok) {
    console.error('Error:', JSON.stringify(data, null, 2))
    process.exit(1)
  }

  // Handle async snapshot response
  let result = Array.isArray(data) ? data[0] : data
  if (result?.snapshot_id) {
    const snapshotId = result.snapshot_id
    console.log(`Async snapshot: ${snapshotId} — polling for result...`)
    while (true) {
      await new Promise(r => setTimeout(r, 5000))
      const poll = await fetch(
        `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      )
      if (poll.status === 202) { process.stdout.write('.'); continue }
      const pollData = await poll.json()
      result = Array.isArray(pollData) ? pollData[0] : pollData
      break
    }
    console.log()
  }

  console.log('=== RESPONSE ===')
  console.log(result.answer_text ?? JSON.stringify(result, null, 2))
  console.log('\n=== CITATIONS ===')
  console.log(JSON.stringify(result.citations ?? [], null, 2))
  console.log('\n=== META ===')
  console.log('Model:', result.model)
  console.log('Web search triggered:', result.web_search_triggered)
  console.log('Total latency:', Date.now() - start, 'ms')
}

main()
