'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Dataset } from '@/types';
import { fetchDataTypes } from '@/services/apiService';
import ChartWrapper from '@/components/ChartWrapper';
import { Spin } from 'antd';

interface MissingnessChartProps {
  data: Dataset | null;
  inModal?: boolean;
}

const MissingnessSummaryChart: React.FC<MissingnessChartProps> = ({ data, inModal }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dtypes, setDtypes] = useState<Record<string, string>>({});
  const [dtypesLoaded, setDtypesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!data || !data.headers.length || !svgRef.current || !containerRef.current) return;

    const loadAndRender = async () => {
      setLoading(true);
      try {
        const dtypesFromApi = await fetchDataTypes();
        setDtypes(dtypesFromApi);
        setDtypesLoaded(true);
      } finally {
        setLoading(false);
      }
    };

    loadAndRender();
  }, [data]);

  useEffect(() => {
    if (!data || !data.headers.length || !svgRef.current || !containerRef.current || !dtypesLoaded) return;

    const containerWidth = containerRef.current.clientWidth;
    const margin = { top: 20, right: 20, bottom: 20, left: 160 };
    const width = containerWidth;
    const barHeight = 30;
    const spacing = 10;

    const missingnessData = data.headers
      .map(header => {
        const missingCount = data.rows.filter(row => !row[header] || row[header] === '').length;
        const total = data.rows.length;
        return {
          feature: header,
          missing: missingCount,
          percent: (missingCount / total) * 100,
        };
      })
      .sort((a, b) => b.missing - a.missing);

    const height = margin.top + margin.bottom + missingnessData.length * (barHeight + spacing);

    const x = d3.scaleLinear()
      .domain([0, d3.max(missingnessData, d => d.missing) || 0])
      .nice()
      .range([margin.left, width - margin.right]);

    const y = d3.scaleBand()
      .domain(missingnessData.map(d => d.feature))
      .range([margin.top, height - margin.bottom])
      .padding(0.2);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const tooltip = d3.select(containerRef.current)
      .append('div')
      .style('position', 'absolute')
      .style('background', 'rgba(0,0,0,0.75)')
      .style('color', 'white')
      .style('padding', '6px 10px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0);

    svg.append('g')
      .attr('transform', `translate(0,${margin.top})`)
      .call(d3.axisTop(x).ticks(5));

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y))
      .selectAll('text')
      .attr('font-size', '12px')
      .attr('fill', '#1f2937')
      .style('cursor', 'pointer')
      .each(function (_, i) {
        const label = missingnessData[i].feature;
        const maxChars = 20;
        const textNode = d3.select(this);
        const truncated = label.length > maxChars ? label.slice(0, maxChars - 3) + '...' : label;
        textNode.text(truncated);
        const dtype = dtypes[label] || 'unknown';
        textNode.append('title').html(`<strong>${label}</strong><br/>Type: <em>${dtype}</em>`);
      });

    svg.selectAll('rect')
      .data(missingnessData)
      .join('rect')
      .attr('y', d => y(d.feature)!)
      .attr('x', x(0))
      .attr('width', d => x(d.missing) - x(0))
      .attr('height', y.bandwidth())
      .attr('fill', '#0072B2')
      .on('mouseover', (event, d) => {
        const dtype = dtypes[d.feature] || 'unknown';
        tooltip.transition().duration(200).style('opacity', 0.9);
        tooltip.html(
          `<strong>${d.feature}</strong><br/>
          Type: <em>${dtype}</em><br/>
          ${d.missing} missing (${d.percent.toFixed(1)}%)`
        );
      })
      .on('mousemove', event => {
        tooltip
          .style('left', `${event.offsetX + 10}px`)
          .style('top', `${event.offsetY - 10}px`);
      })
      .on('mouseleave', () => {
        tooltip.transition().duration(200).style('opacity', 0);
      });

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMinYMin meet')
      .attr('width', '100%')
      .attr('height', height);

    return () => {
      tooltip.remove();
    };
  }, [data, dtypesLoaded, dtypes]);

  if (!data || !data.rows.length) return null;

  return (
    <ChartWrapper
      title="Data Missingness Summary"
      tooltipContent={
        <div style={{ maxWidth: 300 }}>
          <p><strong>Missingness Summary</strong> shows how many values are missing in each column of the dataset.</p>
          <p>Click the expand icon to view a full-sized version.</p>
        </div>
      }
      modalContent={<MissingnessSummaryChart data={data} inModal />}
      inModal={inModal}
    >
      <Spin spinning={loading}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }}>
          <svg ref={svgRef} />
        </div>
      </Spin>
    </ChartWrapper>
  );
};

export default MissingnessSummaryChart;
