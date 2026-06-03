import { NextRequest, NextResponse } from 'next/server';
import { convexServerClient } from '@/lib/convex-server';
import { api } from '../../../../../convex/_generated/api';
import { createDialogueAgent } from '@/mastra/agents/dialogueAgent';
import { Mastra } from '@mastra/core/mastra';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;
    
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // 1. Check if there's any pending OCEAN generation needed
    const pending = await convexServerClient.query(api.ocean.checkPendingOCEAN, { userId });
    
    if (!pending) {
      return NextResponse.json({ status: "skipped", reason: "Nothing pending" });
    }

    // 2. Fetch the user's AI config to run local Mastra generation
    const profile = await convexServerClient.query(api.ai.getSystemProfileContext);
    const profileDoc = await convexServerClient.query(api.ocean_queries.getUserProfileForOCEAN, { userId });
    
    // Default provider logic (or extract from preferences if stored)
    const prefs = profileDoc?.preferences || {};
    const provider = prefs.provider || 'ollama'; 
    const modelId = prefs.modelId || 'llama3.3';
    const customConfigs = prefs.customConfigs || {};
    const apiKey = customConfigs[provider]?.apiKey;
    const baseUrl = customConfigs[provider]?.baseUrl;

    // We don't inject the behavioral profile into THIS agent since it's generating the profile itself!
    // But we use the generic Dialogue agent base
    const agent = createDialogueAgent(provider, modelId, apiKey, baseUrl, profile?.name, profile?.bio);
    const mastra = new Mastra({ agents: { dialogueAgent: agent } });
    const aiAgent = mastra.getAgent('dialogueAgent');

    // 3. Execute generation based on type
    if (pending.type === 'weekly') {
      const { prevWeekStart, timezoneOffset } = pending;
      
      // Calculate week interval
      const weekStartTime = prevWeekStart as number;
      const weekEndTime = weekStartTime + 7 * 24 * 60 * 60 * 1000;
      
      // Get last week's digest for Anterograde tracking
      const previousWeekly = await convexServerClient.query(api.ocean_queries.getWeeklyDigestByWeek, { 
        userId, 
        weekStart: weekStartTime - 7 * 24 * 60 * 60 * 1000 
      });
      const oldWeeklyContext = previousWeekly ? previousWeekly.digest : "No previous weekly digest available.";

      // Fetch base memories from the target week
      // (Wait, we need a query to get memories by time range. Let's assume we can fetch them or pass it off)
      // Since this route runs in Node, we could query 'memories' directly if we add a query for it.
      const memories = await convexServerClient.query(api.ocean_queries.getMemoriesInRange, {
        userId,
        startTime: weekStartTime,
        endTime: weekEndTime
      });
      
      const memoriesText = memories.map((m: any) => `- ${new Date(m._creationTime).toISOString()}: ${m.text}`).join('\n');
      
      const prompt = `You are a behavioral analyst using the Big 5 (OCEAN) personality framework. Synthesize the user's weekly memories into a behavioral profile.

## Previous Weekly Summary (For Anterograde tracking)
${oldWeeklyContext}

## This Week's Memories
${memoriesText || "No recorded memories this week."}

## Instructions
1. **Analyze**: Map the memories to the Big 5 OCEAN traits.
2. **Retrograde**: Explain WHY certain behaviors happened based on the week's events.
3. **Anterograde**: Compare with the 'Previous Weekly Summary'. Did a trait increase or decrease? Explain the trajectory.

## Output Format
Weekly OCEAN Digest - [Date]:

- **Openness**: [Band] ([percentile]) - [evidence]
  - Retrograde: [why it happened]
  - Anterograde: [trajectory]
- **Conscientiousness**: [Band] ([percentile]) - [evidence]
  - Retrograde: [why it happened]
  - Anterograde: [trajectory]
- **Extraversion**: [Band] ([percentile]) - [evidence]
- **Agreeableness**: [Band] ([percentile]) - [evidence]
- **Neuroticism**: [Band] ([percentile]) - [evidence]

**Summary**: [2-3 sentence overall assessment]`;

      const response = await aiAgent.generate(prompt);
      const digest = response.text.trim();
      
      const weekLabel = `Week of ${new Date(weekStartTime).toLocaleDateString()}`;

      await convexServerClient.mutation(api.ocean_queries.insertWeeklyDigest, {
        userId,
        weekStart: weekStartTime,
        weekStartStr: new Date(weekStartTime).toLocaleDateString(),
        weekLabel,
        digest
      });
      
      return NextResponse.json({ status: "success", type: "weekly", generated: true });
    }
    
    if (pending.type === 'monthly') {
      const weeklies = await convexServerClient.query(api.ocean_queries.getWeeklyDigestsForMonthly, { userId });
      const existingProfile = profileDoc?.behavioralProfile || "No existing behavioral profile.";
      
      const weeklyDigests = weeklies.map((w: any) => w.digest).reverse();
      const weekLabels = weeklies.map((w: any) => w.weekLabel).reverse();

      const prompt = `You are a behavioral analyst using the Big 5 (OCEAN) personality framework. Synthesize 4 weekly OCEAN digests into a monthly behavioral profile.
  
## Existing Behavioral Profile
${existingProfile}
  
## Weekly OCEAN Digests (chronological order)
${weeklyDigests.map((d: string, i: number) => `--- ${weekLabels[i]} ---\n${d}`).join("\n\n")}
  
## Instructions
1. **Cross-week pattern analysis**: Identify which OCEAN traits are consistent across all 4 weeks vs which are volatile.
2. **Trait evolution**: Note if any trait shows a clear trend across the month.
3. **Refine the behavioral profile**: Compare the 4-week pattern against the existing profile. Update it if consistent changes exist.
4. **No-Bias Rule**: Inactivity across weeks does NOT lower scores. Only sustained behavioral change updates the profile.

## Output Format
Monthly OCEAN Profile:

- **Openness**: [Band] ([percentile]) - [stable/volatile] - [evidence from 4 weeks]
- **Conscientiousness**: [Band] ([percentile]) - [stable/volatile] - [evidence]
- **Extraversion**: [Band] ([percentile]) - [stable/volatile] - [evidence]
- **Agreeableness**: [Band] ([percentile]) - [stable/volatile] - [evidence]
- **Neuroticism**: [Band] ([percentile]) - [stable/volatile] - [evidence]

**Profile Changes**: [What changed]
**Summary**: [3-4 sentence overall monthly assessment]`;

      const response = await aiAgent.generate(prompt);
      const monthlyDigest = response.text.trim();

      // Archive weeklies and update profile
      for (const weekly of weeklies) {
        await convexServerClient.mutation(api.ocean_queries.insertArchivedSummary, {
          userId,
          type: "weekly",
          originalDate: weekly.weekStart,
          originalDateStr: weekly.weekStartStr,
          content: weekly.digest,
        });
        await convexServerClient.mutation(api.ocean_queries.deleteWeeklyDigest, {
          id: weekly._id,
        });
      }
      
      if (profileDoc?.monthlyNotesSummaries?.[0]) {
        await convexServerClient.mutation(api.ocean_queries.insertArchivedSummary, {
          userId,
          type: "monthly",
          originalDate: Date.now(),
          originalDateStr: new Date().toLocaleDateString(),
          content: profileDoc.monthlyNotesSummaries[0],
        });
      }
      
      await convexServerClient.mutation(api.ocean_queries.updateUserProfileOCEAN, {
        userId,
        monthlyDigest,
      });

      return NextResponse.json({ status: "success", type: "monthly", generated: true });
    }

    return NextResponse.json({ status: "unknown_type" });
  } catch (error: any) {
    console.error("OCEAN generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
