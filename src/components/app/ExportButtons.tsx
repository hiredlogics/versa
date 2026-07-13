"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ExportButtons({ searchId }: { searchId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          window.location.href = `/api/export/csv?searchId=${searchId}`;
        }}
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          window.location.href = `/api/export/excel?searchId=${searchId}`;
        }}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Export Excel
      </Button>
    </div>
  );
}
