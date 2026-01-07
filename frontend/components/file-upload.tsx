
"use client";

import { useCallback } from "react";
import { UploadCloud } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

export function FileUpload({ onFileSelect }: FileUploadProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <Card
      className={cn(
        "border-2 border-dashed border-white/10 bg-slate-950 p-16 text-center hover:bg-white/5 transition-colors cursor-pointer group",
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => document.getElementById("fileInput")?.click()}
    >
      <input
        type="file"
        id="fileInput"
        className="hidden"
        accept=".csv"
        onChange={handleChange}
      />
      <div className="flex flex-col items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
          <UploadCloud className="h-8 w-8 text-orange-500" />
        </div>
        <div className="space-y-1">
            <h3 className="text-xl font-light text-white">Upload CSV</h3>
            <p className="text-sm text-gray-400">
            Drag and drop your IBKR export here
            </p>
        </div>
      </div>
    </Card>
  );
}
