
import { GoogleGenAI, Type } from "@google/genai";
import { Priority, Subtask, Team, Status } from "../types";

// Helper types for AI response
export interface AIAnalysisResult {
  title: string;
  description: string;
  priority: Priority;
  suggestedLabels: string[];
  subtasks: string[];
}

export interface AIDraftTask {
  title: string;
  description: string;
  teamName: string; // AI returns the name, we map to ID
  priority: string;
  labels: string[];
  subtasks: string[];
  branchName: string;
}

// New type for Task Enrichment
export interface TaskEnrichmentResult {
  description: string;
  subtasks: string[];
  englishSlug: string;
}

export interface ProjectQuestionInput {
  question: string;
  project: { name: string; description?: string; icon: string };
  issues: Array<{
    identifier: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    assigneeId: string | null;
  }>;
  users: Array<{ id: string; name: string }>;
}

export interface WorkspaceQuestionInput {
  question: string;
  user: { id: string; name?: string | null; email?: string | null };
  issues: Array<{
    identifier: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    projectId?: string | null;
    updatedAt: Date;
  }>;
  projects: Array<{ id: string; name: string; icon: string }>;
}

export interface WorkspaceRecommendationInput {
  user: { id: string; name?: string | null; email?: string | null };
  myIssues: Array<{
    identifier: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    projectId?: string | null;
  }>;
  availableIssues: Array<{
    identifier: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    projectId?: string | null;
  }>;
  projects: Array<{ id: string; name: string; icon: string }>;
}

export interface WorkspaceRecommendation {
  identifier: string;
  reason: string;
}

const GEMINI_MODEL = 'gemini-3-flash-preview';
const DOUBAO_MODEL = 'doubao-seed-1-8-251228';
const AI_MODEL_STORAGE_KEY = 'ai_model';
const AI_KEY_STORAGE_KEY = 'ai_api_key';
const AI_CUSTOM_MODEL_STORAGE_KEY = 'ai_custom_model';
const AI_CUSTOM_BASE_URL_STORAGE_KEY = 'ai_custom_base_url';
const DOUBAO_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const DOUBAO_PROXY_ENDPOINT = '/api/ark/responses';
const REQUEST_TIMEOUT_MS = 60000;

const getSelectedModel = () => {
  if (typeof window === 'undefined') return GEMINI_MODEL;
  const stored = localStorage.getItem(AI_MODEL_STORAGE_KEY);
  if (stored === 'custom') return 'custom';
  if (stored === DOUBAO_MODEL) return DOUBAO_MODEL;
  return GEMINI_MODEL;
};

const getGeminiClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key missing. Set VITE_GEMINI_API_KEY in .env.local.');
  }
  return new GoogleGenAI({ apiKey });
};

const getDoubaoApiKey = () => {
  const envKey = (import.meta.env.VITE_ARK_API_KEY || import.meta.env.ARK_API_KEY) as string | undefined;
  if (envKey) return envKey;
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AI_KEY_STORAGE_KEY);
};

const getCustomConfig = () => {
  if (typeof window === 'undefined') return { apiKey: null, model: null, baseUrl: null };
  return {
    apiKey: localStorage.getItem(AI_KEY_STORAGE_KEY),
    model: localStorage.getItem(AI_CUSTOM_MODEL_STORAGE_KEY),
    baseUrl: localStorage.getItem(AI_CUSTOM_BASE_URL_STORAGE_KEY),
  };
};

const extractDoubaoText = (payload: any) => {
  if (!payload) return '';
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (typeof payload?.output?.text === 'string') return payload.output.text;
  const outputs = Array.isArray(payload.output) ? payload.output : [];
  for (const item of outputs) {
    if (typeof item?.text === 'string') return item.text;
    const content = item?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const outputText = content.find((entry: any) => entry?.type === 'output_text' && typeof entry?.text === 'string');
      if (outputText?.text) return outputText.text;
      const directText = content.find((entry: any) => typeof entry?.text === 'string');
      if (directText?.text) return directText.text;
    }
  }
  const responseText = payload?.response?.output_text;
  if (typeof responseText === 'string') return responseText;
  const choiceText = payload?.choices?.[0]?.message?.content;
  return typeof choiceText === 'string' ? choiceText : '';
};

const requestDoubao = async (
  input: string | Array<Record<string, unknown>>,
  options: {
    model: string;
    apiKey: string | null;
    missingKeyMessage: string;
    endpoint?: string;
    retryCount?: number;
    requireApiKey?: boolean;
  }
) => {
  const apiKey = options.apiKey;
  if (options.requireApiKey !== false && !apiKey) {
    throw new Error(options.missingKeyMessage);
  }
  const attempts = Math.max(1, (options.retryCount ?? 1) + 1);
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const start = Date.now();
    try {
      const endpoint = options.endpoint || DOUBAO_ENDPOINT;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      console.info('[Doubao] request start', { endpoint, model: options.model, attempt: attempt + 1 });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: options.model, input }),
        signal: controller.signal,
      });
      console.info('[Doubao] response received', { status: response.status, elapsedMs: Date.now() - start });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`火山豆包请求失败: ${response.status} ${errorText}`);
      }
      const payload = await response.json();
      const output = extractDoubaoText(payload).trim();
      console.info('[Doubao] output length', { length: output.length });
      return output;
    } catch (error: any) {
      lastError = error;
      console.warn('[Doubao] request failed', { attempt: attempt + 1, elapsedMs: Date.now() - start, error: error?.message || error });
      if (error?.name !== 'AbortError' || attempt === attempts - 1) {
        if (error?.name === 'AbortError') {
          throw new Error('火山豆包请求超时，请稍后重试。');
        }
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
};

const generateText = async (prompt: string, config?: { responseMimeType?: string; responseSchema?: unknown }) => {
  const model = getSelectedModel();
  if (model === DOUBAO_MODEL) {
    return requestDoubao(prompt, {
      model: DOUBAO_MODEL,
      apiKey: null,
      missingKeyMessage: '火山豆包内置密钥缺失，请配置 ARK_API_KEY。',
      retryCount: 1,
      requireApiKey: false,
      endpoint: DOUBAO_PROXY_ENDPOINT,
    });
  }
  if (model === 'custom') {
    const custom = getCustomConfig();
    if (!custom.model) {
      throw new Error('自定义模型名称未配置，请在个人设置中填写。');
    }
    return requestDoubao(prompt, {
      model: custom.model,
      apiKey: custom.apiKey,
      missingKeyMessage: '自定义模型 API Key 未配置，请在个人设置中填写。',
      endpoint: custom.baseUrl || DOUBAO_ENDPOINT,
      retryCount: 1,
    });
  }
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config,
  });
  return response.text?.trim() || '';
};

const parseJsonText = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  return trimmed;
};

const generateJson = async <T,>(prompt: string, config?: { responseMimeType?: string; responseSchema?: unknown }) => {
  const text = await generateText(prompt, config);
  if (!text) {
    throw new Error('AI 返回为空');
  }
  const normalized = parseJsonText(text);
  try {
    return JSON.parse(normalized) as T;
  } catch (error) {
    const model = getSelectedModel();
    if (model === DOUBAO_MODEL || model === 'custom') {
      const retryPrompt = `${prompt}\n\n请仅输出合法JSON，不要包含其他文本或代码块。`;
      const retryText = await generateText(retryPrompt, config);
      const retryNormalized = parseJsonText(retryText);
      return JSON.parse(retryNormalized) as T;
    }
    throw error;
  }
};

// Helper to sanitize double-escaped newlines which can occur in AI JSON responses
const cleanText = (text: string) => text.replace(/\\n/g, '\n');

export const analyzeIssueInput = async (rawInput: string, projectContext?: string): Promise<AIAnalysisResult | null> => {
  try {
    const contextPrompt = projectContext 
        ? `\n当前所属项目背景 (Project Context):\n"${projectContext}"\n\n重要：请务必根据上述项目背景来优化任务描述、技术术语和标签建议。` 
        : "";

    const result = await generateJson<AIAnalysisResult>(
      `你是一位使用 Linear 的专业产品经理。请分析这个任务输入："${rawInput}"。
      ${contextPrompt}
      
      请生成 JSON 格式的回复：
      1. 优化标题，使其简洁且以行动为导向（中文）。
      2. 撰写专业的任务描述（Markdown 格式）。请使用无序列表 (-) 来列出要点，使用加粗 (**text**) 强调关键信息。不要使用标题语法 (#)，保持段落简洁。
      3. 根据紧迫性关键词估算优先级（默认为“中”）。
      4. 建议最多3个简短的标签。
      5. 如果适用，建议2-3个子任务。
      `,
      {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            priority: { type: Type.STRING, enum: Object.values(Priority) },
            suggestedLabels: { type: Type.ARRAY, items: { type: Type.STRING } },
            subtasks: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["title", "description", "priority", "suggestedLabels", "subtasks"]
        }
      }
    );

    return {
        ...result,
        description: cleanText(result.description)
    };
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return null;
  }
};

export const breakdownTask = async (title: string, description: string): Promise<Subtask[] | null> => {
  // Deprecated in favor of enrichTaskDetails for the button action, but kept for compatibility
  return null; 
}

export const enrichTaskDetails = async (
  title: string,
  projectName?: string,
  projectContext?: string,
  relatedTasks?: string[]
): Promise<TaskEnrichmentResult | null> => {
  try {
    const contextBlock = projectName
      ? `\n当前项目: "${projectName}"\n项目背景说明:\n"${projectContext || ''}"\n相关任务列表:\n${(relatedTasks || []).map(t => `- ${t}`).join('\n') || '(无)'}\n\n重要：必须结合项目背景与相关任务进行分析与拆解。`
      : "\n当前未选择项目，请按通用产品需求理解进行分析。";
    const result = await generateJson<TaskEnrichmentResult>(
      `分析以下任务标题，并生成详细的任务详情。
      
      任务标题: "${title}"
      ${contextBlock}
      
      请生成 JSON 格式的回复:
      1. 详细的任务描述 (Markdown 格式)。
         - 必须使用 H2 (##) 作为章节标题（例如：## 背景 context, ## 需求 requirements, ## 验收标准 acceptance criteria）。
         - 使用无序列表 (-) 清晰列出需求点。
         - 对关键参数或强调内容使用加粗 (**Bold**)。
         - 可以在适当的地方包含代码块。
      2. 3-5个具体的子任务。
      3. 将标题翻译成英文，并转换为 kebab-case (例如: "user-login-feature")，用于 git 分支命名。必须是纯英文。
      `,
      {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            subtasks: { type: Type.ARRAY, items: { type: Type.STRING } },
            englishSlug: { type: Type.STRING }
          },
          required: ["description", "subtasks", "englishSlug"]
        }
      }
    );

    return {
        ...result,
        description: cleanText(result.description)
    };
  } catch (error) {
    console.error("Task Enrichment failed:", error);
    return null;
  }
};

export const analyzeProjectNote = async (
  note: string,
  teams: Team[],
  projectName?: string,
  projectContext?: string
): Promise<AIDraftTask[] | null> => {
    try {
      const teamNames = teams.map(t => t.name).join(', ');
      const contextBlock = projectName
        ? `\n当前项目: "${projectName}"\n项目背景说明:\n"${projectContext || ''}"\n\n重要：拆解必须严格结合项目背景进行。`
        : "\n当前未选择项目，请按通用产品需求理解进行拆解。";
      
      const results = await generateJson<AIDraftTask[]>(
        `你是一位项目经理。请分析以下会议纪要或项目笔记，并将其拆解为多个具体的执行任务。
        
        笔记内容:
        "${note}"
        
        现有团队列表: [${teamNames}]
        ${contextBlock}
        
        要求：
        1. 识别出具体的任务项。
        2. 根据上下文，将每个任务分配给最合适的团队（必须从上述团队列表中选择）。
        3. 估算优先级。
        4. 提取关键信息作为描述 (Markdown 格式)。使用列表和加粗来组织信息。
        5. 如果任务复杂，拆解为子任务。
        6. 为每个任务生成一个合理的 git 分支名，使用 kebab-case，全英文，基于任务标题与项目语境，不要使用随机字母。
        
        返回 JSON 数组。
        `,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    teamName: { type: Type.STRING, enum: teams.map(t => t.name) },
                    priority: { type: Type.STRING, enum: Object.values(Priority) },
                    labels: { type: Type.ARRAY, items: { type: Type.STRING } },
                    subtasks: { type: Type.ARRAY, items: { type: Type.STRING } },
                    branchName: { type: Type.STRING }
                },
                required: ["title", "description", "teamName", "priority", "branchName"]
            }
          }
        }
      );
  
      return results.map(r => ({
          ...r,
          description: cleanText(r.description)
      }));
    } catch (error) {
      console.error("AI Project Note Analysis failed:", error);
      return null;
    }
  }

export const suggestProjectEmoji = async (name: string, description: string): Promise<string | null> => {
  try {
    const text = await generateText(
      `Suggest a single emoji that best represents a project named "${name}" with description "${description}".
      Return ONLY the emoji character, nothing else. Do not return JSON. Example output: 🚀`
    );
    // Extract first emoji-like character or fallback to folder
    return text ? text.trim().substring(0, 2) : '📁';
  } catch (error) {
    console.error("AI Emoji failed:", error);
    return '📁';
  }
};

export const answerProjectQuestion = async (input: ProjectQuestionInput): Promise<string> => {
  const userMap = new Map(input.users.map(u => [u.id, u.name]));
  const issueLines = input.issues.map(issue => {
    const assigneeName = issue.assigneeId ? (userMap.get(issue.assigneeId) || '未知') : '未分配';
    return `- ${issue.identifier} | ${issue.title} | 状态:${issue.status} | 优先级:${issue.priority} | 负责人:${assigneeName}\n  描述:${issue.description || '无'}`;
  });

  const context = `项目名称: ${input.project.name}
项目说明: ${input.project.description || '无'}
项目任务列表(包含已完成):
${issueLines.join('\n') || '(无任务)'}

注意：只能基于以上已知信息回答，不要编造。若信息不足，请明确回复“我不知道”。`;

  const text = await generateText(
    `你是项目助手。请回答用户的问题。

${context}

用户问题: ${input.question}
`
  );

  return text.trim() || '我不知道';
};

export const answerWorkspaceQuestion = async (input: WorkspaceQuestionInput): Promise<string> => {
  const projectMap = new Map(input.projects.map(p => [p.id, `${p.icon} ${p.name}`]));
  const issueLines = input.issues.map(issue => {
    const projectName = issue.projectId ? projectMap.get(issue.projectId) || '未归类' : '未归类';
    const updatedAt = issue.updatedAt instanceof Date ? issue.updatedAt : new Date(issue.updatedAt);
    return `- ${issue.identifier} | ${issue.title} | 状态:${issue.status} | 优先级:${issue.priority} | 项目:${projectName} | 更新时间:${updatedAt.toLocaleDateString('zh-CN')}
  描述:${issue.description || '无'}`;
  });

  const context = `当前用户: ${input.user.name || input.user.email || '成员'}
我的任务列表(包含已完成):
${issueLines.join('\n') || '(无任务)'}

注意：只能基于以上已知信息回答，不要编造。输出要可执行，给出明确行动建议与优先顺序。若信息不足，请明确回复“我不知道”。`;

  const text = await generateText(
    `你是个人工作台助手。请回答用户的问题，并给出可落地的行动建议。

${context}

用户问题: ${input.question}
`
  );

  return text.trim() || '我不知道';
};

export const recommendWorkspaceTasks = async (input: WorkspaceRecommendationInput): Promise<WorkspaceRecommendation[]> => {
  const projectMap = new Map(input.projects.map(p => [p.id, `${p.icon} ${p.name}`]));
  const myLines = input.myIssues.map(issue => {
    const projectName = issue.projectId ? projectMap.get(issue.projectId) || '未归类' : '未归类';
    return `- ${issue.identifier} | ${issue.title} | 状态:${issue.status} | 优先级:${issue.priority} | 项目:${projectName}
  描述:${issue.description || '无'}`;
  });
  const availableLines = input.availableIssues.map(issue => {
    const projectName = issue.projectId ? projectMap.get(issue.projectId) || '未归类' : '未归类';
    return `- ${issue.identifier} | ${issue.title} | 状态:${issue.status} | 优先级:${issue.priority} | 项目:${projectName}
  描述:${issue.description || '无'}`;
  });

  const results = await generateJson<WorkspaceRecommendation[]>(
    `你是个人工作台助手，需要推荐未认领任务。

当前用户: ${input.user.name || input.user.email || '成员'}
我的任务:
${myLines.join('\n') || '(无)'}

可认领任务候选:
${availableLines.join('\n') || '(无)'}

要求：
1. 推荐 1-3 条与我当前已完成或进行中任务强关联的未认领任务。
2. 返回 JSON 数组，每条包含 identifier 与 reason。
3. 只能从候选列表中挑选，不要编造。
`,
    {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            identifier: { type: Type.STRING },
            reason: { type: Type.STRING },
          },
          required: ['identifier', 'reason'],
        },
      },
    }
  );

  return results;
};
