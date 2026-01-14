"use client";

import { NewsHeadline } from "@/lib/api-client";

// Decode HTML entities like &#39; -> ' and &amp; -> &
function decodeHtmlEntities(text: string): string {
  if (typeof window === 'undefined') {
    // Server-side fallback - handle common entities manually
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  }
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

// Format datetime as YYYY-MM-DD HH:MM
function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

interface NewsItemListProps {
  headlines: NewsHeadline[];
  loading: boolean;
  emptyMessage?: string;
  accentColor?: "orange" | "blue";
  onArticleClick: (article: {
    articleId: string;
    providerCode: string;
    headline: string;
    body?: string;
    url?: string;
    imageUrl?: string;
  }) => void;
}

export function NewsItemList({
  headlines,
  loading,
  emptyMessage = "No news available",
  accentColor = "orange",
  onArticleClick,
}: NewsItemListProps) {
  const colorClasses = {
    orange: {
      spinner: "border-orange-500",
      hoverBorder: "hover:border-orange-500/30",
      hoverText: "group-hover:text-orange-400",
      arrow: "group-hover:text-orange-500",
    },
    blue: {
      spinner: "border-blue-500",
      hoverBorder: "hover:border-blue-500/30",
      hoverText: "group-hover:text-blue-400",
      arrow: "group-hover:text-blue-500",
    },
  };

  const colors = colorClasses[accentColor];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${colors.spinner}`} />
      </div>
    );
  }

  if (headlines.length === 0) {
    return (
      <div className="text-gray-500 py-8 text-center">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {headlines.map((news, idx) => (
        <div
          key={`${news.articleId}-${idx}`}
          className={`p-4 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 ${colors.hoverBorder} transition-colors cursor-pointer group`}
          onClick={() => {
            onArticleClick({
              articleId: news.articleId,
              providerCode: news.providerCode,
              headline: decodeHtmlEntities(news.headline),
              body: news.body || news.teaser,
              url: news.url,
              imageUrl: news.imageUrl,
            });
          }}
        >
          <div className="flex items-start gap-4">
            {/* Thumbnail */}
            {news.imageUrl && (
              <div className="flex-shrink-0 w-20 h-14 rounded overflow-hidden bg-slate-800">
                <img
                  src={news.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-medium text-white ${colors.hoverText} transition-colors leading-snug line-clamp-2`}>
                {decodeHtmlEntities(news.headline)}
              </h3>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  {news.providerName || news.providerCode}
                </span>
                <span className="text-xs text-gray-500">
                  {formatDateTime(news.time)}
                </span>
              </div>
            </div>
            
            <span className={`text-gray-600 ${colors.arrow} transition-colors text-lg flex-shrink-0`}>→</span>
          </div>
        </div>
      ))}
    </div>
  );
}
