"use client";

import { Download, FileSpreadsheet } from "lucide-react";

interface ExportButtonsProps {
  disabled?: boolean;
}

export default function ExportButtons({ disabled = false }: ExportButtonsProps) {
  function handleExport(format: "csv" | "xlsx") {
    const link = document.createElement("a");
    link.href = `/api/leads/export?format=${format}`;
    link.download = `leads-${Date.now()}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleExport("csv")}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </button>
      <button
        onClick={() => handleExport("xlsx")}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <FileSpreadsheet className="w-4 h-4" />
        Export Excel
      </button>
    </div>
  );
}
