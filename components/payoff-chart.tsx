
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface ChartDataPoint {
  price: number;
  pnl: number; // Total P&L
  stockPnl?: number; // Stock only P&L
  optionsPnl?: number; // Options only P&L
}

interface PayoffChartProps {
  data: ChartDataPoint[];
  currentPrice: number;
  breakevens: number[];
  showStock: boolean;
  showOptions: boolean;
  showCombined: boolean;
}

export function PayoffChart({
  data,
  currentPrice,
  breakevens,
  showStock,
  showOptions,
  showCombined,
}: PayoffChartProps) {
  const currencyFormatter = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };
  
  const priceFormatter = (value: number) => `$${value.toFixed(0)}`;

  const yValues = data.flatMap(d => {
      const vals = [];
      if (showCombined) vals.push(d.pnl);
      if (showStock && d.stockPnl !== undefined) vals.push(d.stockPnl);
      if (showOptions && d.optionsPnl !== undefined) vals.push(d.optionsPnl);
      return vals;
  });
  const minY = Math.min(0, ...yValues) * 1.1;
  const maxY = Math.max(0, ...yValues) * 1.1;

  return (
    <div className="h-[500px] w-full bg-slate-950 p-6 rounded-xl border border-white/10 shadow-2xl">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} stroke="#fff" />
          <XAxis 
            dataKey="price" 
            type="number" 
            domain={['auto', 'auto']}
            tickFormatter={priceFormatter}
            stroke="#666"
            tick={{ fill: '#666' }}
          />
          <YAxis 
            tickFormatter={currencyFormatter}
            domain={[minY, maxY]}
            stroke="#666"
            tick={{ fill: '#666' }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#000', borderColor: '#333', color: '#fff' }}
            formatter={(value: number | undefined) => [currencyFormatter(value || 0), '']}
            labelFormatter={(label) => `Price: ${priceFormatter(Number(label))}`}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          
          <ReferenceLine y={0} stroke="#fff" strokeWidth={2} />
          <ReferenceLine 
            x={currentPrice} 
            stroke="#F97316" 
            strokeDasharray="3 3" 
            label={{ value: "Current", position: "top", fill: "#F97316", fontSize: 12 }} 
          />
          
          {breakevens.map((be, idx) => (
             <ReferenceLine 
                key={idx} 
                x={be} 
                stroke="#fff" 
                strokeDasharray="3 3" 
                label={{ value: `Breakeven ${be.toFixed(0)}`, position: "insideTopRight", fill: "#ccc", fontSize: 10 }}
             />
          ))}

          {showStock && (
            <Line
              type="monotone"
              dataKey="stockPnl"
              name="Stock Only"
              stroke="#334155" // Slate 700
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
            />
          )}

          {showOptions && (
              <Line
              type="monotone"
              dataKey="optionsPnl"
              name="Options Only"
              stroke="#A855F7" // Purple 500
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
            />
          )}

          {showCombined && (
            <Line
              type="monotone"
              dataKey="pnl"
              name="Combined P&L"
              stroke="#F97316" // Orange 500
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: "#F97316", stroke: "#fff" }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
