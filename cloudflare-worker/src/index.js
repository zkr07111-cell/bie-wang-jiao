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

      const prompt = `你是大学作业信息识别助手。请直接阅读截图内容，理解老师布置的作业，而不是只做OCR。当前时间：${now}。

请提取以下字段，并只返回一个JSON对象：
{
  "course": "课程名称；不确定则空字符串",
  "title": "简洁的作业名称",
  "deadline": "YYYY-MM-DDTHH:mm；没有明确时间但明确日期时默认23:59；无法可靠确定则空字符串",
  "submission_method": "如学习通、邮件、纸质版、课堂提交等；不确定则空字符串",
  "email": "提交邮箱；没有则空字符串",
  "notes": "除以上字段外仍需保留的完整作业要求，简洁但不要漏掉字数、格式、题号、文件命名、组队要求等",
  "deadline_raw": "截图中关于截止时间的原始说法；没有则空字符串",
  "needs_deadline_confirmation": true
}

时间理解规则：
1. “明天/后天/下周三/本周五”等相对日期要结合当前时间解析。
2. “上课前/下次课前/第八周前/国庆回来第一节课”等如果缺少课程表或学期信息，不要猜具体时间，deadline留空，needs_deadline_confirmation=true。
3. 明确到具体年月日和时刻时，needs_deadline_confirmation=false。
4. 如果只明确日期，没有时刻，可按23:59填写，但needs_deadline_confirmation=true。
5. 不要臆造课程名、邮箱或作业要求。`;

      const result = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
        messages: [
          { role: 'system', content: '你负责从大学课程作业截图中准确提取结构化信息。只输出JSON。' },
          { role: 'user', content: prompt },
        ],
        image,
        temperature: 0.1,
        max_tokens: 700,
      });

      const text = result?.response ?? result?.result ?? result?.output_text ?? '';
      const data = cleanJson(text);
      return Response.json({ data }, { headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' } });
    } catch (error) {
      return Response.json({ error: 'AI识别失败', detail: String(error?.message || error) }, { status: 500, headers: cors(origin) });
    }
  },
};
