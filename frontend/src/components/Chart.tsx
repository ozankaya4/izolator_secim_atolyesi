import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  MarkLineComponent,
  MarkPointComponent,
  AxisPointerComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  MarkLineComponent,
  MarkPointComponent,
  AxisPointerComponent,
  SVGRenderer,
]);
export function Chart({
  option,
  label,
  group,
  full = false,
}: {
  option: EChartsCoreOption;
  label: string;
  group?: string;
  full?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    const c = echarts.init(ref.current!, undefined, { renderer: 'svg' });
    chart.current = c;
    if (group) {
      c.group = group;
      echarts.connect(group);
    }
    const resize = new ResizeObserver(() => c.resize());
    resize.observe(ref.current!);
    const before = () => c.resize({ width: ref.current?.clientWidth || 680, height: 280 });
    const after = () => c.resize();
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      resize.disconnect();
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      c.dispose();
    };
  }, [group]);
  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);
  useEffect(() => {
    if (full) chart.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
  }, [full]);
  return <div ref={ref} className="chart" role="img" aria-label={label} />;
}
export const baseChart: EChartsCoreOption = {
  animation: false,
  color: ['#176b68', '#c68b3b', '#7b8b94', '#9e6680'],
  textStyle: { fontFamily: 'Inter, Arial, sans-serif', fontSize: 11 },
  grid: { left: 64, right: 24, top: 52, bottom: 62 },
  tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
  legend: { top: 6, left: 50 },
  xAxis: {
    type: 'value',
    nameLocation: 'middle',
    nameGap: 30,
    splitLine: { lineStyle: { color: '#e6ece9' } },
  },
  yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e6ece9' } } },
};
