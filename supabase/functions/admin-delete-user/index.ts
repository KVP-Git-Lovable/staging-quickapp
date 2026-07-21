const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  return new Response(
    JSON.stringify({ error: 'User deletion is disabled. Use Deactivate.' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
