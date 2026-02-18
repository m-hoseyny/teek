"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paintbrush, Type, Palette } from "lucide-react";
import {
  TEXT_ALIGN_OPTIONS,
  TEXT_TRANSFORM_OPTIONS,
  type TextAlignOption,
  type TextTransformOption,
  normalizeFontSize,
  normalizeFontWeight,
  normalizeLineHeight,
  normalizeLetterSpacing,
  normalizeStrokeWidth,
  normalizeShadowOpacity,
  normalizeShadowBlur,
  normalizeShadowOffset,
} from "@/lib/font-style-options";
import { hexToRgba, formatTextOption, applyTextTransform } from "@/lib/utils";

const SWATCH_COLORS = ["#FFFFFF", "#000000", "#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1"];

interface Font {
  name: string;
  display_name: string;
}

interface CaptionSettingsSectionProps {
  fontFamily: string;
  setFontFamily: (font: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  fontColor: string;
  setFontColor: (color: string) => void;
  fontWeight: number;
  setFontWeight: (weight: number) => void;
  lineHeight: number;
  setLineHeight: (height: number) => void;
  letterSpacing: number;
  setLetterSpacing: (spacing: number) => void;
  textTransform: TextTransformOption;
  setTextTransform: (transform: TextTransformOption) => void;
  textAlign: TextAlignOption;
  setTextAlign: (align: TextAlignOption) => void;
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  shadowColor: string;
  setShadowColor: (color: string) => void;
  shadowOpacity: number;
  setShadowOpacity: (opacity: number) => void;
  shadowBlur: number;
  setShadowBlur: (blur: number) => void;
  shadowOffsetX: number;
  setShadowOffsetX: (offset: number) => void;
  shadowOffsetY: number;
  setShadowOffsetY: (offset: number) => void;
  transitionsEnabled: boolean;
  setTransitionsEnabled: (enabled: boolean) => void;
  availableFonts: Font[];
  isUploadingFont: boolean;
  fontUploadMessage: string | null;
  fontUploadError: string | null;
  onFontUpload: (file: File) => void;
  isLoading: boolean;
}

export function CaptionSettingsSection({
  fontFamily,
  setFontFamily,
  fontSize,
  setFontSize,
  fontColor,
  setFontColor,
  fontWeight,
  setFontWeight,
  lineHeight,
  setLineHeight,
  letterSpacing,
  setLetterSpacing,
  textTransform,
  setTextTransform,
  textAlign,
  setTextAlign,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  shadowColor,
  setShadowColor,
  shadowOpacity,
  setShadowOpacity,
  shadowBlur,
  setShadowBlur,
  shadowOffsetX,
  setShadowOffsetX,
  shadowOffsetY,
  setShadowOffsetY,
  transitionsEnabled,
  setTransitionsEnabled,
  availableFonts,
  isUploadingFont,
  fontUploadMessage,
  fontUploadError,
  onFontUpload,
  isLoading,
}: CaptionSettingsSectionProps) {
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const previewTextStyle: React.CSSProperties = {
    color: fontColor,
    fontSize: `${fontSize}px`,
    fontFamily: `'${fontFamily}', system-ui, -apple-system, sans-serif`,
    fontWeight,
    textAlign,
    lineHeight,
    letterSpacing: `${letterSpacing}px`,
    WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : undefined,
    textShadow:
      shadowOpacity > 0
        ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${hexToRgba(shadowColor, shadowOpacity)}`
        : undefined,
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-500 uppercase tracking-wide">Caption Settings</h3>

      {/* Font Customization Section */}
      <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
        >
          <div className="flex items-center gap-2">
            <Paintbrush className="w-4 h-4" />
            <h3 className="text-sm font-medium text-black">Font & Style Options</h3>
          </div>
          <button type="button" className="text-xs text-gray-500">
            {showAdvancedOptions ? "Hide" : "Show"}
          </button>
        </div>

        {showAdvancedOptions && (
          <div className="space-y-4 pt-2">
            {/* Font Family Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-black flex items-center gap-2">
                <Type className="w-4 h-4" />
                Font Family
              </label>
              <Select value={fontFamily} onValueChange={setFontFamily} disabled={isLoading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select font" />
                </SelectTrigger>
                <SelectContent>
                  {availableFonts.map((font) => (
                    <SelectItem key={font.name} value={font.name}>
                      {font.display_name}
                    </SelectItem>
                  ))}
                  {availableFonts.length === 0 && (
                    <SelectItem value="TikTokSans-Regular">TikTok Sans Regular</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <input
                type="file"
                accept=".ttf,font/ttf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFontUpload(file);
                  e.target.value = "";
                }}
                disabled={isLoading || isUploadingFont}
                className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
              />
              <p className="text-xs text-gray-500">
                {isUploadingFont ? "Uploading font..." : "Upload a .ttf file to add it to this list."}
              </p>
              {fontUploadMessage && <p className="text-xs text-green-600">{fontUploadMessage}</p>}
              {fontUploadError && <p className="text-xs text-red-600">{fontUploadError}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-black">Font Size: {fontSize}px</label>
              <div className="px-2 pt-5">
                <Slider
                  value={[fontSize]}
                  onValueChange={(value) => setFontSize(normalizeFontSize(value[0]))}
                  max={48}
                  min={24}
                  step={1}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-black">Font Weight: {fontWeight}</label>
              <div className="px-2 pt-5">
                <Slider
                  value={[fontWeight]}
                  onValueChange={(value) => setFontWeight(normalizeFontWeight(value[0]))}
                  max={900}
                  min={300}
                  step={100}
                  disabled={isLoading}
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Line Height: {lineHeight.toFixed(1)}</label>
                <div className="px-2 pt-5">
                  <Slider
                    value={[lineHeight]}
                    onValueChange={(value) => setLineHeight(normalizeLineHeight(value[0]))}
                    min={1}
                    max={2}
                    step={0.1}
                    disabled={isLoading}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Letter Spacing: {letterSpacing}px</label>
                <div className="px-2 pt-5">
                  <Slider
                    value={[letterSpacing]}
                    onValueChange={(value) => setLetterSpacing(normalizeLetterSpacing(value[0]))}
                    min={0}
                    max={6}
                    step={1}
                    disabled={isLoading}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Text Transform</label>
                <Select
                  value={textTransform}
                  onValueChange={(value) => setTextTransform(value as TextTransformOption)}
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select transform" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEXT_TRANSFORM_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {formatTextOption(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Text Align</label>
                <Select
                  value={textAlign}
                  onValueChange={(value) => setTextAlign(value as TextAlignOption)}
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select alignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEXT_ALIGN_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {formatTextOption(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-black flex items-center gap-2">
                <Palette className="w-4 h-4" />
                Font Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={fontColor}
                  onChange={(e) => setFontColor(e.target.value)}
                  disabled={isLoading}
                  className="w-12 h-8 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                />
                <Input
                  type="text"
                  value={fontColor}
                  onChange={(e) => setFontColor(e.target.value)}
                  disabled={isLoading}
                  placeholder="#FFFFFF"
                  className="flex-1 h-8"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
              <div className="flex gap-2 mt-2">
                {SWATCH_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFontColor(color)}
                    disabled={isLoading}
                    className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Stroke Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    disabled={isLoading}
                    className="w-12 h-8 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <Input
                    type="text"
                    value={strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    disabled={isLoading}
                    placeholder="#000000"
                    className="flex-1 h-8"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {SWATCH_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setStrokeColor(color)}
                      disabled={isLoading}
                      className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Stroke Width: {strokeWidth}px</label>
                <div className="px-2 pt-5">
                  <Slider
                    value={[strokeWidth]}
                    onValueChange={(value) => setStrokeWidth(normalizeStrokeWidth(value[0]))}
                    min={0}
                    max={8}
                    step={1}
                    disabled={isLoading}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Shadow Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={shadowColor}
                    onChange={(e) => setShadowColor(e.target.value)}
                    disabled={isLoading}
                    className="w-12 h-8 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <Input
                    type="text"
                    value={shadowColor}
                    onChange={(e) => setShadowColor(e.target.value)}
                    disabled={isLoading}
                    placeholder="#000000"
                    className="flex-1 h-8"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {SWATCH_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setShadowColor(color)}
                      disabled={isLoading}
                      className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Shadow Opacity: {Math.round(shadowOpacity * 100)}%</label>
                <div className="px-2 pt-5">
                  <Slider
                    value={[shadowOpacity]}
                    onValueChange={(value) => setShadowOpacity(normalizeShadowOpacity(value[0]))}
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={isLoading}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Shadow Blur: {shadowBlur}px</label>
                <div className="px-2 pt-5">
                  <Slider
                    value={[shadowBlur]}
                    onValueChange={(value) => setShadowBlur(normalizeShadowBlur(value[0]))}
                    min={0}
                    max={8}
                    step={1}
                    disabled={isLoading}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Shadow X: {shadowOffsetX}px</label>
                <div className="px-2 pt-5">
                  <Slider
                    value={[shadowOffsetX]}
                    onValueChange={(value) => setShadowOffsetX(normalizeShadowOffset(value[0]))}
                    min={-12}
                    max={12}
                    step={1}
                    disabled={isLoading}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-black">Shadow Y: {shadowOffsetY}px</label>
                <div className="px-2 pt-5">
                  <Slider
                    value={[shadowOffsetY]}
                    onValueChange={(value) => setShadowOffsetY(normalizeShadowOffset(value[0]))}
                    min={-12}
                    max={12}
                    step={1}
                    disabled={isLoading}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div
              className="mt-4 p-3 rounded-lg bg-gray-100 border border-gray-300"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
                backgroundSize: "20px 20px",
                backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
              }}
            >
              <p style={previewTextStyle} className="w-full">
                Preview: {applyTextTransform("Your subtitle will look like this", textTransform)}
              </p>
            </div>

            {/* Transitions Toggle */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="transitions-enabled"
                  checked={transitionsEnabled}
                  onChange={(e) => setTransitionsEnabled(e.target.checked)}
                  disabled={isLoading}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <label htmlFor="transitions-enabled" className="text-sm font-medium text-black cursor-pointer">
                    Enable transitions between clips
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    When enabled, clips will have smooth transitions applied between them during final video assembly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
