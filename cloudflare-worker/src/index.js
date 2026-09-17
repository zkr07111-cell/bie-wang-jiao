const ALLOWED_ORIGIN = 'https://zkr07111-cell.github.io';

function cors(origin) {
  const allow = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function cleanJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model did not return JSON');
  return JSON.parse(candidate.slice(start, end + 1));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ALLOWED_ORIGIN;
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors(origin) });

    try {
      const body = await request.json();
      const image = body?.image;
      const now = body?.now || new Date().toISOString();
      if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
        return Response.json({ error: 'Invalid image' }, { status: 400, headers: cors(origin) });
      }

      const question = `请阅读这张大学作业通知截图，并只返回一个JSON对象，不要输出Markdown或解释。当前时间：${now}。

JSON字段：
{
  "course": "课程名称；不确定则空字符串",
  "title": "简洁的作业名称",
  "deadline": "YYYY-MM-DDTHH:mm；只有日期无时间时默认23:59；无法可靠判断则空字符串",
  "submission_method": "学习通、邮件、纸质版、课堂提交等；不确定则空字符串",
  "email": "明确出现的提交邮箱；没有则空字符串",
  "notes": "其余重要要求，如题号、字数、格式、文件命名、组队等",
  "deadline_raw": "截图中的截止时间原文；没有则空字符串",
  "needs_deadline_confirmation": true
}

规则：
1. 明天、后天、下周三、本周五等相对日期结合当前时间解析。
2. 下次课前、第八周前、国庆后第一节课等缺少必要上下文时不要猜，deadline留空，needs_deadline_confirmation=true。
3. 明确到具体日期和时刻时 needs_deadline_confirmation=false。
4. 只明确日期没有时刻时可填23:59，但 needs_deadline_confirmation=true。
5. 不要臆造课程、邮箱或作业要求。`;

      const result = await env.AI.run('@cf/moondream/moondream3.1-9B-A2B', {
        task: 'query',
        image,
        question,
        reasoning: false,
        temperature: 0.1,
        max_tokens: 700,
        stream: false,
      });

      const text = result?.answer ?? result?.response ?? result?.result ?? '';
      const data = cleanJson(text);
      return Response.json({ data }, { headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' } });
    } catch (error) {
      return Response.json({ error: 'AI识别失败', detail: String(error?.message || error) }, { status: 500, headers: cors(origin) });
    }
  },
};
