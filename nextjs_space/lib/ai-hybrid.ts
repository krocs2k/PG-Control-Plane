/**
 * Hybrid AI Utility
 * Combines fast template-based generation with LLM fallback for complex queries
 */

// Keywords that trigger LLM enhancement
const COMPLEX_QUERY_KEYWORDS = [
  'why',
  'explain',
  'compare',
  'what if',
  'should i',
  'best practice',
  'trade-off',
  'tradeoff',
  'unusual',
  'strange',
  'weird',
  'custom',
  'specific',
  'edge case',
  'complex',
  'advanced',
  'optimize for',
  'migration strategy',
  'risk assessment',
  'deep dive',
  'detailed analysis',
  'comprehensive',
  'recommend between',
];

// Questions that need reasoning
const REASONING_PATTERNS = [
  /how\s+(should|would|could|can)/i,
  /what.*best/i,
  /which.*choose/i,
  /is\s+it\s+(safe|ok|recommended)/i,
  /difference\s+between/i,
  /pros\s+and\s+cons/i,
  /when\s+to\s+use/i,
];

export interface HybridResponse<T> {
  data: T;
  confidence: number;
  source: 'template' | 'llm' | 'hybrid';
  llmEnhancement?: string;
  processingTime: number;
}

export interface LLMEnhancementRequest {
  context: string;
  templateResponse: any;
  userQuery?: string;
  domain: 'qa' | 'governance' | 'tech-scout';
}

/**
 * Detects if a query requires LLM enhancement based on keywords and patterns
 */
export function requiresLLMEnhancement(query: string): boolean {
  if (!query) return false;
  
  const lowerQuery = query.toLowerCase();
  
  // Check for complex keywords
  if (COMPLEX_QUERY_KEYWORDS.some(kw => lowerQuery.includes(kw))) {
    return true;
  }
  
  // Check for reasoning patterns
  if (REASONING_PATTERNS.some(pattern => pattern.test(query))) {
    return true;
  }
  
  // Check query length - long queries often need more nuanced responses
  if (query.length > 200) {
    return true;
  }
  
  return false;
}

/**
 * Calculates confidence score based on template coverage
 */
export function calculateConfidence(templateResult: any, context: any): number {
  let confidence = 75; // Base confidence for template responses
  
  // Boost confidence if we have comprehensive data
  if (templateResult.recommendations?.length > 3) confidence += 5;
  if (templateResult.issues?.length > 0) confidence += 5; // We detected something
  if (templateResult.score !== undefined) confidence += 5;
  
  // Reduce confidence for edge cases
  if (!context.clusterId) confidence -= 10; // No specific cluster context
  if (context.customQuery) confidence -= 15; // Custom user query needs more reasoning
  
  return Math.max(40, Math.min(95, confidence));
}

/**
 * Get system prompts for different AI domains
 */
export function getDomainSystemPrompt(domain: 'qa' | 'governance' | 'tech-scout'): string {
  const prompts = {
    qa: `You are an expert PostgreSQL QA engineer specializing in database testing, performance analysis, and configuration validation.
You help teams create comprehensive test plans, analyze SQL queries for performance issues, and validate cluster configurations.
Provide specific, actionable insights based on PostgreSQL best practices.
Always consider the cluster topology, replication mode, and node configuration in your analysis.`,
    
    governance: `You are an expert in database security, compliance, and governance for PostgreSQL environments.
You specialize in CIS benchmarks, GDPR compliance, PCI-DSS requirements, and security posture assessment.
Provide clear findings with specific remediation steps.
Consider the organization's specific regulatory requirements and risk tolerance.`,
    
    'tech-scout': `You are a PostgreSQL technology advisor who tracks the latest versions, extensions, and industry trends.
You help teams plan upgrades, evaluate new technologies, and optimize their PostgreSQL architecture.
Provide balanced recommendations considering stability, performance, and future-proofing.
Always cite specific version numbers and release information.`,
  };
  
  return prompts[domain];
}

/**
 * Calls LLM API for enhancement
 */
export async function getLLMEnhancement(request: LLMEnhancementRequest): Promise<string | null> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) {
    console.warn('ABACUSAI_API_KEY not configured, skipping LLM enhancement');
    return null;
  }
  
  try {
    const systemPrompt = getDomainSystemPrompt(request.domain);
    
    const userMessage = `
Context: ${request.context}

Template Analysis Result:
${JSON.stringify(request.templateResponse, null, 2)}

${request.userQuery ? `User Question: ${request.userQuery}\n\n` : ''}
Based on the template analysis above, provide additional insights, nuances, or considerations that may have been missed.
Focus on:
1. Edge cases or unusual scenarios
2. Context-specific recommendations
3. Potential risks or trade-offs not covered
4. Deeper explanation of critical findings

Keep your response concise but insightful. Format as a brief expert commentary.`;

    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error('LLM API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('LLM enhancement error:', error);
    return null;
  }
}

/**
 * Main hybrid processing function
 */
export async function processHybrid<T>(
  templateFn: () => T,
  context: {
    domain: 'qa' | 'governance' | 'tech-scout';
    clusterId?: string;
    userQuery?: string;
    clusterContext?: string;
    forceEnhancement?: boolean;
  }
): Promise<HybridResponse<T>> {
  const startTime = Date.now();
  
  // Step 1: Always run template first (fast path)
  const templateResult = templateFn();
  
  // Step 2: Calculate confidence
  const confidence = calculateConfidence(templateResult, context);
  
  // Step 3: Determine if LLM enhancement is needed
  const needsEnhancement = 
    context.forceEnhancement ||
    confidence < 70 ||
    requiresLLMEnhancement(context.userQuery || '');
  
  let llmEnhancement: string | null = null;
  let source: 'template' | 'llm' | 'hybrid' = 'template';
  
  // Step 4: Get LLM enhancement if needed (non-blocking for low-confidence)
  if (needsEnhancement) {
    llmEnhancement = await getLLMEnhancement({
      context: context.clusterContext || 'PostgreSQL cluster analysis',
      templateResponse: templateResult,
      userQuery: context.userQuery,
      domain: context.domain,
    });
    
    if (llmEnhancement) {
      source = 'hybrid';
    }
  }
  
  const processingTime = Date.now() - startTime;
  
  return {
    data: templateResult,
    confidence: llmEnhancement ? Math.min(95, confidence + 15) : confidence,
    source,
    llmEnhancement: llmEnhancement || undefined,
    processingTime,
  };
}

/**
 * Async background enhancement - returns template immediately, enhances later
 */
export function processWithBackgroundEnhancement<T>(
  templateFn: () => T,
  context: {
    domain: 'qa' | 'governance' | 'tech-scout';
    clusterId?: string;
    userQuery?: string;
    clusterContext?: string;
  },
  onEnhancement?: (enhancement: string) => void
): { immediate: T; enhancementPromise: Promise<string | null> } {
  const immediate = templateFn();
  
  const enhancementPromise = getLLMEnhancement({
    context: context.clusterContext || 'PostgreSQL cluster analysis',
    templateResponse: immediate,
    userQuery: context.userQuery,
    domain: context.domain,
  }).then(enhancement => {
    if (enhancement && onEnhancement) {
      onEnhancement(enhancement);
    }
    return enhancement;
  });
  
  return { immediate, enhancementPromise };
}
