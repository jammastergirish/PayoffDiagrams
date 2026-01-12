"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

export interface CandlestickBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandlestickChartProps {
  data: CandlestickBar[];
  livePrice?: number;
  timeframe: string;
}

interface CandleData {
  date: string;
  displayDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // For recharts Bar rendering
  candleBody: [number, number]; // [bottom, top] of the candle body
  isGreen: boolean;
  wickTop: number;
  wickBottom: number;
}

export function CandlestickChart({ data, livePrice, timeframe }: CandlestickChartProps) {
  // Transform data for candlestick rendering
  const chartData = useMemo(() => {
    return data.map((bar): CandleData => {
      const isGreen = bar.close >= bar.open;
      const bodyBottom = Math.min(bar.open, bar.close);
      const bodyTop = Math.max(bar.open, bar.close);
      
      return {
        date: bar.date,
        displayDate: formatDate(bar.date, timeframe),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        candleBody: [bodyBottom, bodyTop],
        isGreen,
        wickTop: bar.high,
        wickBottom: bar.low,
      };
    });
  }, [data, timeframe]);

  // Calculate Y domain with padding
  const yDomain = useMemo(() => {
    if (data.length === 0) return [0, 100];
    
    const allPrices = data.flatMap(d => [d.high, d.low]);
    if (livePrice) allPrices.push(livePrice);
    
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    const padding = (max - min) * 0.05;
    
    return [min - padding, max + padding];
  }, [data, livePrice]);

  // Calculate max volume for volume bar scaling
  const maxVolume = useMemo(() => {
    if (data.length === 0) return 1;
    return Math.max(...data.map(d => d.volume));
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-gray-500">
        No chart data available
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Main Price Chart */}
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <XAxis
            dataKey="displayDate"
            stroke="#4b5563"
            tick={{ fill: "#6b7280", fontSize: 10 }}
            interval="preserveStartEnd"
            tickLine={false}
          />
          <YAxis
            domain={yDomain}
            stroke="#4b5563"
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickFormatter={(val) => `$${val.toFixed(0)}`}
            width={55}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload[0]) return null;
              const d = payload[0].payload as CandleData;
              const change = d.close - d.open;
              const changePct = ((change / d.open) * 100).toFixed(2);
              
              return (
                <div className="bg-slate-900 border border-white/10 rounded-lg p-3 shadow-xl">
                  <div className="text-xs text-gray-400 mb-2">{d.date}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-gray-400">Open</span>
                    <span className="text-white font-mono">${d.open.toFixed(2)}</span>
                    <span className="text-gray-400">High</span>
                    <span className="text-white font-mono">${d.high.toFixed(2)}</span>
                    <span className="text-gray-400">Low</span>
                    <span className="text-white font-mono">${d.low.toFixed(2)}</span>
                    <span className="text-gray-400">Close</span>
                    <span className="text-white font-mono">${d.close.toFixed(2)}</span>
                  </div>
                  <div className={`mt-2 pt-2 border-t border-white/10 text-sm font-medium ${d.isGreen ? 'text-emerald-400' : 'text-red-400'}`}>
                    {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct}%)
                  </div>
                  {d.volume > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Vol: {formatVolume(d.volume)}
                    </div>
                  )}
                </div>
              );
            }}
          />
          
          {/* Live price reference line */}
          {livePrice && livePrice > 0 && (
            <ReferenceLine
              y={livePrice}
              stroke="#f97316"
              strokeDasharray="3 3"
              strokeWidth={1.5}
              label={{
                value: `$${livePrice.toFixed(2)}`,
                fill: "#f97316",
                fontSize: 11,
                position: "right",
              }}
            />
          )}
          
          {/* Candlestick wicks (rendered as thin bars) */}
          <Bar
            dataKey={(d: CandleData) => [d.wickBottom, d.wickTop]}
            barSize={1}
            fill="#6b7280"
            isAnimationActive={false}
          />
          
          {/* Candlestick bodies */}
          <Bar
            dataKey="candleBody"
            barSize={8}
            isAnimationActive={false}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.isGreen ? "#22c55e" : "#ef4444"}
                stroke={entry.isGreen ? "#22c55e" : "#ef4444"}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
      
      {/* Volume Chart */}
      <ResponsiveContainer width="100%" height={60}>
        <ComposedChart
          data={chartData}
          margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
        >
          <XAxis dataKey="displayDate" hide />
          <YAxis hide domain={[0, maxVolume * 1.2]} />
          <Bar
            dataKey="volume"
            isAnimationActive={false}
            barSize={6}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`vol-${index}`}
                fill={entry.isGreen ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
      
      <div className="text-center text-xs text-gray-500 mt-1">Volume</div>
    </div>
  );
}

function formatDate(dateStr: string, timeframe: string): string {
  try {
    if (timeframe === "1H" || timeframe === "1D") {
      // Show time for intraday
      const timePart = dateStr.split("T")[1];
      return timePart?.substring(0, 5) || dateStr.substring(11, 16);
    }
    // Show date for longer timeframes
    return dateStr.substring(5, 10); // MM-DD
  } catch {
    return dateStr;
  }
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toString();
}
