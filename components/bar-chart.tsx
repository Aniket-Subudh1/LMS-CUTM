'use client';

import { Bar, BarChart as Chart, CartesianGrid, Rectangle, XAxis, YAxis, type BarShapeProps } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

export type BarDatum = { label: string; value: number | null; tone?: 'primary' | 'teal' };

const FILL = { primary: 'var(--primary)', teal: 'var(--teal)' } as const;

// One column per label, drawn with the theme's tokens (08 §5.2). The picture is hidden from screen readers: the
// caption says in words what it shows and a visually hidden table gives every value. Wide sets scroll sideways on a
// phone rather than squeezing their labels.
export function BarChart({
  data,
  max,
  ticks,
  name,
  unit = '',
  summary,
}: {
  data: BarDatum[];
  max: number;
  // The values marked on the side axis; their meaning ("3 strong") belongs in the card's description.
  ticks: number[];
  // What one value is ("Average level"), for the tooltip and the hidden table.
  name: string;
  unit?: string;
  summary: string;
}) {
  return (
    <figure className="relative grid gap-3">
      <div className="-mx-1 overflow-x-auto px-1" aria-hidden="true">
        <ChartContainer
          config={{ value: { label: name, color: FILL.primary } }}
          className="aspect-auto h-52 w-full"
          style={{ minWidth: `${Math.max(16, data.length * 1.875)}rem` }}
        >
          <Chart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="2 4" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tickMargin={6} fontSize={10.5} />
            <YAxis
              domain={[0, max]}
              ticks={ticks}
              tickFormatter={(value: number) => `${value}${unit}`}
              tickLine={false}
              axisLine={false}
              width={unit ? 40 : 24}
              fontSize={11}
            />
            <ChartTooltip
              cursor={{ fill: 'var(--muted)' }}
              content={<ChartTooltipContent hideIndicator formatter={(value) => `${String(value)}${unit}`} />}
            />
            <Bar
              dataKey="value"
              maxBarSize={28}
              radius={[3, 3, 0, 0]}
              shape={(props: BarShapeProps) => (
                <Rectangle {...props} fill={FILL[data[props.index]?.tone ?? 'primary']} />
              )}
            />
          </Chart>
        </ChartContainer>
      </div>
      <figcaption className="text-muted-foreground text-xs">{summary}</figcaption>
      <table className="sr-only">
        <caption>{name}</caption>
        <tbody>
          {data.map((datum, i) => (
            <tr key={`${i}-${datum.label}`}>
              <th scope="row">{datum.label}</th>
              <td>{datum.value === null ? 'none' : `${datum.value}${unit}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
