"use client";

import { useRef, useState } from "react";

interface UploadedFile {
  name: string;
  fileId: string;
  deepTextPromptPortion: string;
}

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  uploadedFiles: UploadedFile[];
}

export function FileUpload({ onUpload, uploadedFiles }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await onUpload(file);
    } finally {
      setIsUploading(false);
      // Reset input so the same file can be uploaded again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.png,.jpg,.jpeg,.tiff,.webp"
        className="hidden"
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={isUploading}
        className="px-3 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
        title="Upload document"
      >
        {isUploading ? (
          <svg
            className="animate-spin h-5 w-5 text-gray-500"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        )}
        {uploadedFiles.length > 0 && (
          <span className="text-sm text-gray-600">
            {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>
    </>
  );
}
