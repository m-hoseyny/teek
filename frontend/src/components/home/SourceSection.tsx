"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, CheckCircle, Upload, FileText } from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";

interface SourceSectionProps {
  sourceType: "upload_file" | "video_url";
  setSourceType: (type: "upload_file" | "video_url") => void;
  fileName: string | null;
  fileRef: React.RefObject<File | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploadUrl: string;
  setUploadUrl: (url: string) => void;
  srtFileName: string | null;
  srtInputRef: React.RefObject<HTMLInputElement | null>;
  setSrtFile: (file: File | null) => void;
  setSrtFileName: (name: string | null) => void;
  isDragOver: boolean;
  setIsDragOver: (isDragOver: boolean) => void;
  isLoading: boolean;
  setError: (error: string | null) => void;
}

export function SourceSection({
  sourceType,
  setSourceType,
  fileName,
  fileRef,
  fileInputRef,
  uploadUrl,
  setUploadUrl,
  srtFileName,
  srtInputRef,
  setSrtFile,
  setSrtFileName,
  isDragOver,
  setIsDragOver,
  isLoading,
  setError,
}: SourceSectionProps) {
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    fileRef.current = file;
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0] || null;
    if (file && file.type.startsWith("video/")) {
      fileRef.current = file;
    }
  };

  const handleSrtFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.name.toLowerCase().endsWith(".srt")) {
      setSrtFile(file);
      setSrtFileName(file.name);
    } else if (file) {
      setError("Please upload a valid .srt file");
      if (srtInputRef.current) {
        srtInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-500 uppercase tracking-wide">Source & Subtitles</h3>

      {/* Source Type Selector */}
      <div className="space-y-2">
        <label htmlFor="source-type" className="text-sm font-medium text-black">
          Source Type
        </label>
        <Select
          value={sourceType}
          onValueChange={(value: "upload_file" | "video_url") => {
            setSourceType(value);
            if (value !== "upload_file") {
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
              fileRef.current = null;
            }
            if (value !== "video_url") {
              setUploadUrl("");
            }
          }}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select source type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upload_file">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                Upload File
              </div>
            </SelectItem>
            <SelectItem value="video_url">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                Video URL
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dynamic Input Based on Source Type */}
      {sourceType === "upload_file" ? (
        <div key="source-upload-file" className="space-y-2">
          <label className="text-sm font-medium text-black">Upload Video File</label>
          <input
            id="video-upload"
            type="file"
            accept="video/*,video/x-matroska,.mkv"
            ref={fileInputRef}
            onChange={handleFileChange}
            disabled={isLoading}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragOver
                ? "border-blue-500 bg-blue-50"
                : fileName
                  ? "border-green-500 bg-green-50"
                  : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {fileName ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-green-700">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">{fileName}</span>
                </div>
                <p className="text-xs text-gray-500">Click or drag another file to replace</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-center">
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-gray-600" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Drop your video here, or click to browse</p>
                  <p className="text-xs text-gray-500 mt-1">Supports MP4, MOV, MKV, and other video formats</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div key="source-video-url" className="space-y-2">
          <label htmlFor="video-url" className="text-sm font-medium text-black">
            Video URL
          </label>
          <Input
            id="video-url"
            type="url"
            placeholder="https://example.com/video.mp4"
            value={uploadUrl}
            onChange={(e) => setUploadUrl(e.target.value)}
            disabled={isLoading}
            className="h-11"
          />
          <p className="text-xs text-gray-500">Direct link to video file (MP4, MOV, MKV, etc.)</p>
          <p className="text-xs text-amber-600 font-medium">⚠ YouTube URLs are not supported</p>
        </div>
      )}

      {/* SRT Upload Section */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-black">Subtitle File (SRT)</label>
        <div className="mt-3 space-y-2">
          <input
            id="srt-upload"
            type="file"
            accept=".srt"
            ref={srtInputRef}
            onChange={handleSrtFileChange}
            disabled={isLoading}
            className="hidden"
          />
          <div
            onClick={() => srtInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              srtFileName
                ? "border-green-500 bg-green-50"
                : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {srtFileName ? (
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-green-700">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium text-sm">{srtFileName}</span>
                </div>
                <p className="text-xs text-gray-500">Click to replace</p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex justify-center">
                  <FileText className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-sm text-gray-600">Click to upload SRT file</p>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Upload your own subtitle file or enable AI transcription below.
          </p>
        </div>
      </div>
    </div>
  );
}
