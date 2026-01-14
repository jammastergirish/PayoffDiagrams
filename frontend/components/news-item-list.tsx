"use client";

import { NewsHeadline } from "@/lib/api-client";

// Decode HTML entities like &#39; -> ' and &amp; -> &
function decodeHtmlEntities(text: string): string {
  if (typeof window === 'undefined') {
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

// Format datetime as relative time (e.g., "2h ago", "15m ago")
function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  // Fall back to date format
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${month}/${day}`;
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
      hoverBorder: "hover:border-orange-500/40",
      hoverText: "group-hover:text-orange-400",
      badge: "bg-orange-500/20 text-orange-400",
    },
    blue: {
      spinner: "border-blue-500",
      hoverBorder: "hover:border-blue-500/40",
      hoverText: "group-hover:text-blue-400",
      badge: "bg-blue-500/20 text-blue-400",
    },
  };

  const colors = colorClasses[accentColor];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className={`animate-spin rounded-full h-10 w-10 border-b-2 ${colors.spinner}`} />
      </div>
    );
  }

  if (headlines.length === 0) {
    return (
      <div className="text-gray-500 py-12 text-center">
        {emptyMessage}
      </div>
    );
  }

  // Split headlines: featured (first with image), rest in grid
  const featuredArticle = headlines.find(h => h.imageUrl);
  const remainingArticles = featuredArticle 
    ? headlines.filter(h => h !== featuredArticle)
    : headlines.slice(1);
  const firstNoImage = !featuredArticle ? headlines[0] : null;

  return (
    <div className="space-y-4">
      {/* Featured Article - Large card at top */}
      {(featuredArticle || firstNoImage) && (
        <div
          className={`relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-white/10 ${colors.hoverBorder} overflow-hidden cursor-pointer group transition-all duration-300 hover:shadow-lg hover:shadow-black/20`}
          onClick={() => {
            const article = featuredArticle || firstNoImage!;
            onArticleClick({
              articleId: article.articleId,
              providerCode: article.providerCode,
              headline: decodeHtmlEntities(article.headline),
              body: article.body || article.teaser,
              url: article.url,
              imageUrl: article.imageUrl,
            });
          }}
        >
          <div className="flex flex-col md:flex-row">
            {/* Featured Image */}
            {featuredArticle?.imageUrl && (
              <div className="md:w-2/5 h-48 md:h-auto relative overflow-hidden">
                <img
                  src={featuredArticle.imageUrl}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-slate-900/50 hidden md:block" />
              </div>
            )}
            
            {/* Featured Content */}
            <div className={`flex-1 p-5 ${featuredArticle?.imageUrl ? 'md:p-6' : 'p-6'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors.badge}`}>
                  {(featuredArticle || firstNoImage)?.providerName || (featuredArticle || firstNoImage)?.providerCode}
                </span>
                <span className="text-xs text-gray-500">
                  {formatRelativeTime((featuredArticle || firstNoImage)?.time || '')}
                </span>
              </div>
              
              <h2 className={`text-lg md:text-xl font-semibold text-white ${colors.hoverText} transition-colors leading-tight mb-3`}>
                {decodeHtmlEntities((featuredArticle || firstNoImage)?.headline || '')}
              </h2>
              
              {(featuredArticle || firstNoImage)?.teaser && (
                <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">
                  {decodeHtmlEntities((featuredArticle || firstNoImage)?.teaser || '')}
                </p>
              )}
              
              <div className="mt-4 flex items-center text-xs text-gray-500">
                <span className={`${colors.hoverText} transition-colors font-medium`}>Read more →</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* News Grid - Remaining articles */}
      {remainingArticles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {remainingArticles.map((news, idx) => (
            <div
              key={`${news.articleId}-${idx}`}
              className={`bg-slate-800/50 rounded-lg border border-white/5 ${colors.hoverBorder} overflow-hidden cursor-pointer group transition-all duration-200 hover:bg-slate-800/80`}
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
              {/* Card Image */}
              {news.imageUrl && (
                <div className="h-32 overflow-hidden">
                  <img
                    src={news.imageUrl}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                    }}
                  />
                </div>
              )}
              
              {/* Card Content */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                    {news.providerName || news.providerCode}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {formatRelativeTime(news.time)}
                  </span>
                </div>
                
                <h3 className={`text-sm font-medium text-white ${colors.hoverText} transition-colors leading-snug line-clamp-3`}>
                  {decodeHtmlEntities(news.headline)}
                </h3>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
