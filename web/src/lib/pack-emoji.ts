/** Emoji badge for pack lists / generator dropdowns (client + server safe). */
export function packEmoji(name: string, slug = "") {
  const s = `${name} ${slug}`.toLowerCase();
  if (/girl|aesthetic|beauty|skincare|wellness/.test(s)) return "🧘‍♀️";
  if (/philos|stoic|think|wisdom/.test(s)) return "🏛️";
  if (/ui|product|app|mockup|showcase/.test(s)) return "📱";
  if (/nature|outdoor|landscape|forest/.test(s)) return "🌿";
  if (/mix|misc|general|auto/.test(s)) return "✨";
  if (/zeno/.test(s)) return "⚡";
  return "🖼️";
}
