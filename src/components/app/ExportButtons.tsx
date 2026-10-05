"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ExportButtons({ searchId }: { searchId: string }) {
  const id = encodeURIComponent(searchId);

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          window.location.href = `/api/export/csv?searchId=${id}`;
        }}
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        CSV
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          window.location.href = `/api/export/excel?searchId=${id}`;
        }}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
        Export Excel
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          window.location.href = `/api/export/csv?searchId=${id}&format=ats`;
        }}
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        CSV for ATS import
      </Button>
    </div>
  );
}
