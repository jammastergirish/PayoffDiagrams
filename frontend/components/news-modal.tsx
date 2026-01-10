"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchNewsArticle, NewsArticle } from "@/lib/api-client";

interface NewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerCode: string;
  articleId: string;
  headline: string;
}

export function NewsModal({ isOpen, onClose, providerCode, articleId, headline }: NewsModalProps) {
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && articleId && providerCode) {
      setLoading(true);
      setArticle(null);
      fetchNewsArticle(providerCode, articleId)
        .then(data => setArticle(data))
        .finally(() => setLoading(false));
    }
  }, [isOpen, articleId, providerCode]);

  // Parse HTML content safely - just render as HTML since IBKR provides formatted content
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      );
    }

    if (!article) {
      return <div className="text-gray-500 py-8 text-center">No content available</div>;
    }

    if (article.error) {
      return (
        <div className="text-red-400 py-8 text-center">
          Error loading article: {article.error}
        </div>
      );
    }

    // The article text from IBKR is typically HTML
    return (
      <div 
        className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: article.text }}
      />
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col bg-slate-950 border-white/10 text-white">
        <DialogHeader className="flex-shrink-0 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono px-2 py-1 rounded bg-orange-500/20 text-orange-400 uppercase">
              {providerCode}
            </span>
          </div>
          <DialogTitle className="text-lg font-medium text-white leading-tight pr-8">
            {headline}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-4 px-1">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
