'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ExportButtonProps {
  reportTitle: string;
  reportData: any;
  onExportPDF?: () => void;
  onExportCSV?: () => void;
}

export function ExportButton({
  reportTitle,
  reportData,
  onExportPDF,
  onExportCSV,
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async () => {
    if (onExportPDF) {
      onExportPDF();
      return;
    }

    setIsExporting(true);
    try {
      const doc = new jsPDF();

      // Add title
      doc.setFontSize(18);
      doc.text(reportTitle, 14, 20);

      // Add date
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

      // Add report data (basic implementation)
      doc.setFontSize(12);
      let yPos = 40;

      if (reportData && typeof reportData === 'object') {
        Object.entries(reportData).forEach(([key, value]) => {
          if (yPos > 280) {
            doc.addPage();
            yPos = 20;
          }

          const formattedKey = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase());

          doc.text(`${formattedKey}: ${JSON.stringify(value)}`, 14, yPos);
          yPos += 8;
        });
      }

      doc.save(`${reportTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (onExportCSV) {
      onExportCSV();
      return;
    }

    setIsExporting(true);
    try {
      // Basic CSV export implementation
      let csvContent = 'data:text/csv;charset=utf-8,';

      if (reportData && typeof reportData === 'object') {
        // Add headers
        const headers = Object.keys(reportData);
        csvContent += headers.join(',') + '\n';

        // Add values
        const values = Object.values(reportData).map(v =>
          typeof v === 'object' ? JSON.stringify(v) : v
        );
        csvContent += values.join(',') + '\n';
      }

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `${reportTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting CSV:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportPDF}>
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportCSV}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
