import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * QA-only: analyses a plain-English test description with an AI model
 * and records the result on the qa_custom_tests row created by the
 * caller. Invoked from src/qa/screens/CustomTestScreen.tsx.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a QA test analyst for a mobile field sales application called QuickApp. It is a Capacitor/React app with a Supabase backend. When given a plain-English test description, you must:
1. Output a structured test plan: a numbered list of the specific things you would verify (UI elements, data writes, navigation steps, expected outcomes).
2. Output a test result: based on your analysis of the described flow and what you know about common failure modes in this type of app, give a preliminary PASS or FAIL assessment with clear reasoning.
3. Output a list of steps_taken as a JSON array of objects with shape: [{ "step": string, "outcome": string }]

Respond in this exact JSON structure and nothing else:
{
  "ai_plan": "<numbered test plan as a string>",
  "pass": true | false,
  "ai_result": "<result narrative explaining your assessment>",
  "steps_taken": [{ "step": "...", "outcome": "..." }]
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let testId: string | undefined;
  let supabaseClient: ReturnType<typeof createClient> | undefined;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const body = await req.json();
    testId = body.testId;
    const prompt = body.prompt as string | undefined;
    const pageContext = body.pageContext as string | null | undefined;

    if (!testId || !prompt) {
      throw new Error('Missing testId or prompt');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Routed through the Lovable AI Gateway (same gateway every other AI
    // feature in this codebase uses) requesting an Anthropic Claude model,
    // so this stays a real Claude call without a separate ANTHROPIC_API_KEY.
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-5-haiku',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Test prompt: ${prompt}\nPage context: ${pageContext || 'not specified'}`,
          },
        ],
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI request failed (${aiResponse.status})`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content ?? '';

    let parsed: { ai_plan?: string; pass?: boolean; ai_result?: string; steps_taken?: unknown };
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in AI response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError: any) {
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }

    const updatePayload = {
      ai_plan: parsed.ai_plan ?? null,
      ai_result: parsed.ai_result ?? null,
      steps_taken: parsed.steps_taken ?? null,
      pass: typeof parsed.pass === 'boolean' ? parsed.pass : null,
      status: parsed.pass ? 'passed' : 'failed',
    };

    const { error: updateError } = await supabaseClient
      .from('qa_custom_tests')
      .update(updatePayload)
      .eq('id', testId);

    if (updateError) {
      throw new Error(`Failed to save result: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, ...updatePayload }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('Error in qa-custom-test-analyst:', error);

    // Never leave the row stuck in status: 'running'.
    if (testId && supabaseClient) {
      try {
        await supabaseClient
          .from('qa_custom_tests')
          .update({ status: 'error', error_message: error.message ?? String(error) })
          .eq('id', testId);
      } catch (updateErr) {
        console.error('Failed to record error status:', updateErr);
      }
    }

    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
