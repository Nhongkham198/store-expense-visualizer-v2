import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Transaction, SheetConfig } from '../types';

interface TransactionsTableProps {
  transactions: Transaction[];
  sheets: SheetConfig[];
}

export const TransactionsTable: React.FC<TransactionsTableProps> = ({ transactions, sheets }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = transactions.filter(t => 
    t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSourceUrl = (index?: number) => {
    if (index === undefined || index < 0 || index >= sheets.length) return null;
    return sheets[index].url;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex justify-between items-center flex-wrap gap-4">
        <h3 className="text-lg font-semibold text-gray-800">รายการค่าใช้จ่าย (Transactions)</h3>
        <input 
          type="text" 
          placeholder="ค้นหารายการ..." 
          className="border rounded-lg px-4 py-2 text-sm w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
              <th className="px-6 py-4 font-medium">วันที่</th>
              <th className="px-6 py-4 font-medium">หมวดหมู่</th>
              <th className="px-6 py-4 font-medium">รายละเอียด</th>
              <th className="px-6 py-4 font-medium text-right">จำนวนเงิน (฿)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((t) => {
              const sourceUrl = getSourceUrl(t.sheetSourceIndex);
              
              return (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors text-sm text-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                        {sourceUrl ? (
                        <a 
                            href={sourceUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1.5 font-medium group"
                            title="เปิด Google Sheet ต้นฉบับ"
                        >
                            {t.displayDate}
                            <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                        ) : (
                        <span className="font-medium">{t.displayDate}</span>
                        )}
                        {t.sourceName && (
                            <span className="text-[10px] text-gray-400 mt-0.5">{t.sourceName}</span>
                        )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                      {t.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">{t.description}</td>
                  <td className="px-6 py-4 text-right font-medium">{t.amount.toLocaleString()}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                  ไม่พบข้อมูลที่ค้นหา
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};