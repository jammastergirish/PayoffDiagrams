"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerCode: string;
  articleId: string;
  headline: string;
  articleBody?: string;  // Body is now included in headline response
  articleUrl?: string;   // Link to original article
}

export function NewsModal({ isOpen, onClose, providerCode, articleId, headline, articleBody, articleUrl }: NewsModalProps) {
  // No longer need to fetch - body is passed directly from headlines

  const renderContent = () => {
    if (!articleBody) {
      return <div className="text-gray-500 py-8 text-center">No content available</div>;
    }

    // The article text from Benzinga is typically HTML
    return (
      <div className="space-y-4">
        <div 
          className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: articleBody }}
        />
        {articleUrl && (
          <div className="pt-4 border-t border-white/10">
            <a 
              href={articleUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 text-sm"
            >
              Read full article on Benzinga →
            </a>
          </div>
        )}
      </div>
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
