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
  articleImageUrl?: string;  // Article image
}

export function NewsModal({ isOpen, onClose, providerCode, articleId, headline, articleBody, articleUrl, articleImageUrl }: NewsModalProps) {
  // No longer need to fetch - body is passed directly from headlines

  const renderContent = () => {
    return (
      <div className="space-y-4">
        {/* Article Image */}
        {articleImageUrl && (
          <div className="w-full rounded-lg overflow-hidden bg-slate-800">
            <img
              src={articleImageUrl}
              alt=""
              className="w-full h-auto max-h-64 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
        
        {/* Article Body */}
        {articleBody ? (
          <>
            <div 
              className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed prose-p:mb-6 prose-li:mb-2 [&>p]:mb-6 [&_p]:mb-6"
              dangerouslySetInnerHTML={{ __html: articleBody }}
            />
          </>
        ) : (
          <div className="text-gray-500 py-4 text-center">No content available</div>
        )}
        
        {articleUrl && (
          <div className="pt-4 border-t border-white/10">
            <a 
              href={articleUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 text-sm"
            >
              Read full article →
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
