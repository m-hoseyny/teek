import type { ChangeEvent, CSSProperties } from "react";
import { Palette, Type } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { TEXT_ALIGN_OPTIONS, TEXT_TRANSFORM_OPTIONS, type TextAlignOption, type TextTransformOption } from "@/lib/font-style-options";

interface SettingsSectionFontProps {
  isSaving: boolean;
  availableFonts: Array<{ name: string; display_name: string }>;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform: TextTransformOption;
  textAlign: TextAlignOption;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  isUploadingFont: boolean;
  fontUploadMessage: string | null;
  fontUploadError: string | null;
  onFontFamilyChange: (value: string) => void;
  onFontSizeChange: (size: number) => void;
  onFontColorChange: (color: string) => void;
  onFontWeightChange: (weight: number) => void;
  onLineHeightChange: (lineHeight: number) => void;
  onLetterSpacingChange: (spacing: number) => void;
  onTextTransformChange: (transform: TextTransformOption) => void;
  onTextAlignChange: (align: TextAlignOption) => void;
  onStrokeColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onShadowColorChange: (color: string) => void;
  onShadowOpacityChange: (opacity: number) => void;
  onShadowBlurChange: (blur: number) => void;
  onShadowOffsetXChange: (offset: number) => void;
  onShadowOffsetYChange: (offset: number) => void;
  onFontUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}

const SWATCH_COLORS = ["#FFFFFF", "#000000", "#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1"];
const PREVIEW_TEXT = "Your subtitle will look like this";

function applyTextTransform(text: string, mode: TextTransformOption): string {
  if (mode === "uppercase") {
    return text.toUpperCase();
  }
  if (mode === "lowercase") {
    return text.toLowerCase();
  }
  if (mode === "capitalize") {
    return text.replace(/\b\p{L}/gu, (match) => match.toUpperCase());
  }
  return text;
}

function hexToRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  if (sanitized.length !== 6) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isLightColor(hex: string): boolean {
  const sanitized = hex.replace("#", "");
  if (sanitized.length !== 6) {
    return false;
  }
  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);
  // Calculate relative luminance using the formula for perceived brightness
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

function formatTextOption(option: string): string {
  return option.charAt(0).toUpperCase() + option.slice(1);
}

export function SettingsSectionFont({
  isSaving,
  availableFonts,
  fontFamily,
  fontSize,
  fontColor,
  fontWeight,
  lineHeight,
  letterSpacing,
  textTransform,
  textAlign,
  strokeColor,
  strokeWidth,
  shadowColor,
  shadowOpacity,
  shadowBlur,
  shadowOffsetX,
  shadowOffsetY,
  isUploadingFont,
  fontUploadMessage,
  fontUploadError,
  onFontFamilyChange,
  onFontSizeChange,
  onFontColorChange,
  onFontWeightChange,
  onLineHeightChange,
  onLetterSpacingChange,
  onTextTransformChange,
  onTextAlignChange,
  onStrokeColorChange,
  onStrokeWidthChange,
  onShadowColorChange,
  onShadowOpacityChange,
  onShadowBlurChange,
  onShadowOffsetXChange,
  onShadowOffsetYChange,
  onFontUpload,
}: SettingsSectionFontProps) {
  const previewStyle: CSSProperties = {
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
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-black flex items-center gap-2">
          <Type className="w-4 h-4" />
          Font Family
        </Label>
        <Select value={fontFamily} onValueChange={onFontFamilyChange} disabled={isSaving || isUploadingFont}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select font" />
          </SelectTrigger>
          <SelectContent>
            {availableFonts.map((font) => (
              <SelectItem key={font.name} value={font.name}>
                {font.display_name}
              </SelectItem>
            ))}
            {availableFonts.length === 0 && <SelectItem value="TikTokSans-Regular">TikTok Sans Regular</SelectItem>}
          </SelectContent>
        </Select>
        <input
          type="file"
          accept=".ttf,font/ttf"
          onChange={onFontUpload}
          disabled={isSaving || isUploadingFont}
          className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
        />
        <p className="text-xs text-gray-500">
          {isUploadingFont ? "Uploading font..." : "Upload a .ttf file to add it to this list."}
        </p>
        {fontUploadMessage && <p className="text-xs text-green-600">{fontUploadMessage}</p>}
        {fontUploadError && <p className="text-xs text-red-600">{fontUploadError}</p>}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-black">Font Size: {fontSize}px</Label>
        <div className="px-2 pt-5">
          <Slider
            value={[fontSize]}
            onValueChange={(value) => onFontSizeChange(value[0])}
            max={48}
            min={24}
            step={1}
            disabled={isSaving || isUploadingFont}
            className="w-full"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-black">Font Weight: {fontWeight}</Label>
        <div className="px-2 pt-5">
          <Slider
            value={[fontWeight]}
            onValueChange={(value) => onFontWeightChange(value[0])}
            max={900}
            min={300}
            step={100}
            disabled={isSaving || isUploadingFont}
            className="w-full"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-black">Line Height: {lineHeight.toFixed(1)}</Label>
          <div className="px-2 pt-5">
            <Slider
              value={[lineHeight]}
              onValueChange={(value) => onLineHeightChange(value[0])}
              min={1}
              max={2}
              step={0.1}
              disabled={isSaving || isUploadingFont}
              className="w-full"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-black">Letter Spacing: {letterSpacing}px</Label>
          <div className="px-2 pt-5">
            <Slider
              value={[letterSpacing]}
              onValueChange={(value) => onLetterSpacingChange(value[0])}
              min={0}
              max={6}
              step={1}
              disabled={isSaving || isUploadingFont}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-black">Text Transform</Label>
          <Select
            value={textTransform}
            onValueChange={(value) => onTextTransformChange(value as TextTransformOption)}
            disabled={isSaving || isUploadingFont}
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
          <Label className="text-sm font-medium text-black">Text Align</Label>
          <Select
            value={textAlign}
            onValueChange={(value) => onTextAlignChange(value as TextAlignOption)}
            disabled={isSaving || isUploadingFont}
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
        <Label className="text-sm font-medium text-black flex items-center gap-2">
          <Palette className="w-4 h-4" />
          Font Color
        </Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={fontColor}
            onChange={(event) => onFontColorChange(event.target.value)}
            disabled={isSaving || isUploadingFont}
            className="w-12 h-10 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
          />
          <Input
            type="text"
            value={fontColor}
            onChange={(event) => onFontColorChange(event.target.value)}
            disabled={isSaving || isUploadingFont}
            placeholder="#FFFFFF"
            className="flex-1 h-10"
            pattern="^#[0-9A-Fa-f]{6}$"
          />
        </div>
        <div className="flex gap-2 mt-2">
          {SWATCH_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onFontColorChange(color)}
              disabled={isSaving || isUploadingFont}
              className="w-8 h-8 rounded border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-black">Stroke Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={strokeColor}
              onChange={(event) => onStrokeColorChange(event.target.value)}
              disabled={isSaving || isUploadingFont}
              className="w-12 h-10 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
            />
            <Input
              type="text"
              value={strokeColor}
              onChange={(event) => onStrokeColorChange(event.target.value)}
              disabled={isSaving || isUploadingFont}
              placeholder="#000000"
              className="flex-1 h-10"
            pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>
          <div className="flex gap-2 mt-2">
            {SWATCH_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onStrokeColorChange(color)}
                disabled={isSaving || isUploadingFont}
                className="w-8 h-8 rounded border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-black">Stroke Width: {strokeWidth}px</Label>
          <div className="px-2 pt-5">
            <Slider
              value={[strokeWidth]}
              onValueChange={(value) => onStrokeWidthChange(value[0])}
              min={0}
              max={8}
              step={1}
              disabled={isSaving || isUploadingFont}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-black">Shadow Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={shadowColor}
              onChange={(event) => onShadowColorChange(event.target.value)}
              disabled={isSaving || isUploadingFont}
              className="w-12 h-10 rounded border border-gray-300 cursor-pointer disabled:cursor-not-allowed"
            />
            <Input
              type="text"
              value={shadowColor}
              onChange={(event) => onShadowColorChange(event.target.value)}
              disabled={isSaving || isUploadingFont}
              placeholder="#000000"
              className="flex-1 h-10"
            pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>
          <div className="flex gap-2 mt-2">
            {SWATCH_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onShadowColorChange(color)}
                disabled={isSaving || isUploadingFont}
                className="w-8 h-8 rounded border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-black">
            Shadow Opacity: {Math.round(shadowOpacity * 100)}%
          </Label>
          <div className="px-2 pt-5">
            <Slider
              value={[shadowOpacity]}
              onValueChange={(value) => onShadowOpacityChange(value[0])}
              min={0}
              max={1}
              step={0.05}
              disabled={isSaving || isUploadingFont}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-black">Shadow Blur: {shadowBlur}px</Label>
          <div className="px-2 pt-5">
            <Slider
              value={[shadowBlur]}
              onValueChange={(value) => onShadowBlurChange(value[0])}
              min={0}
              max={8}
              step={1}
              disabled={isSaving || isUploadingFont}
              className="w-full"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-black">Shadow X: {shadowOffsetX}px</Label>
          <div className="px-2 pt-5">
            <Slider
              value={[shadowOffsetX]}
              onValueChange={(value) => onShadowOffsetXChange(value[0])}
              min={-12}
              max={12}
              step={1}
              disabled={isSaving || isUploadingFont}
              className="w-full"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-black">Shadow Y: {shadowOffsetY}px</Label>
          <div className="px-2 pt-5">
            <Slider
              value={[shadowOffsetY]}
              onValueChange={(value) => onShadowOffsetYChange(value[0])}
              min={-12}
              max={12}
              step={1}
              disabled={isSaving || isUploadingFont}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-black">Preview</Label>
        <div className="p-6 rounded-lg min-h-[120px] flex items-center bg-gray-100 border border-gray-300" style={{ backgroundImage: "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)", backgroundSize: "20px 20px", backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px" }}>
          <p style={previewStyle} className="w-full">
            {applyTextTransform(PREVIEW_TEXT, textTransform)}
          </p>
        </div>
      </div>
    </div>
  );
}
