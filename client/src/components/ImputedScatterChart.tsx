'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Select, Spin } from 'antd';
import ChartWrapper from '@/components/ChartWrapper';
import { useDatasetStore } from '@/store/useDataStore';
import { fetchDataTypes, fetchMissingnessSummary, fetchScatterPlotData } from '@/services/apiService';

const ImputedScatterPlot: React.FC<{ inModal?: boolean }> = ({ inModal }) => {
    const { dataset, isUpdated } = useDatasetStore();
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const [columns, setColumns] = useState<string[]>([]);
    const [imputedColumns, setImputedColumns] = useState<string[]>([]);
    const [xColumn, setXColumn] = useState<string | null>(null);
    const [yColumn, setYColumn] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // useEffect(() => {
    //     if (dataset?.headers) {
    //         setColumns(dataset.headers);
    //         // if (!xColumn && dataset.headers.length > 0) setXColumn(dataset.headers[0]);
    //         // if (!yColumn && dataset.headers.length > 1) setYColumn(dataset.headers[1]);
    //     }
    // }, [dataset, isUpdated]);

    useEffect(() => {
  let cancelled = false;

  (async () => {
    try {
      const dtypes = await fetchDataTypes(); // Record<string, string>
      // If you want ALL columns:
      const cols = Object.keys(dtypes);

      // If you want only numeric columns, use this instead:
      // const numericKinds = new Set(['int64', 'float64', 'int32', 'float32', 'number']);
      // const cols = Object.entries(dtypes)
      //   .filter(([, t]) => numericKinds.has(t.toLowerCase()))
      //   .map(([name]) => name);

      if (!cancelled) {
        setColumns(cols);
        // set defaults if needed
        // if (!xColumn && cols.length > 0) setXColumn(cols[0]);
        // if (!yColumn && cols.length > 1) setYColumn(cols[1]);
        // if (!selectedColumn && cols.length > 0) setSelectedColumn(cols[0]);
      }
    } catch (err) {
      console.error('Error loading dtypes:', err);
      if (!cancelled) setColumns([]);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [dataset, isUpdated]);


    useEffect(() => {
        fetchMissingnessSummary().then(summary => {
            const cols = summary.filter(s => s.percent > 0).map(s => s.feature);
            setImputedColumns(cols);
        });
    }, [dataset, isUpdated]);

    useEffect(() => {
        if (!xColumn || !yColumn || !svgRef.current || !containerRef.current) return;
        setLoading(true);

        fetchScatterPlotData(xColumn, yColumn)
            .then(data => {
                drawScatter(data.points, xColumn, yColumn);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [xColumn, yColumn, dataset, isUpdated]);

    const drawScatter = (points: any[], xKey: string, yKey: string) => {
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const containerWidth = containerRef.current!.clientWidth;
        const containerHeight = containerRef.current!.clientHeight;
        const width = containerWidth;
        const height = containerHeight;
        const margin = { top: 10, right: 30, bottom: 60, left: 60 };

        const x = d3.scaleLinear()
            .domain(d3.extent(points, d => d.x) as [number, number])
            .nice()
            .range([margin.left, width - margin.right]);

        const y = d3.scaleLinear()
            .domain(d3.extent(points, d => d.y) as [number, number])
            .nice()
            .range([height - margin.bottom, margin.top]);

        svg.append('g')
            .attr('transform', `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x))
            .selectAll('text')
            .attr('transform', 'rotate(45)')
            .style('text-anchor', 'start');

        svg.append('g')
            .attr('transform', `translate(${margin.left},0)`)
            .call(d3.axisLeft(y));

        svg.selectAll('.dot')
            .data(points)
            .enter()
            .append('circle')
            .attr('cx', d => x(d.x))
            .attr('cy', d => y(d.y))
            .attr('r', 3)
            .attr('fill', d => d.label === 'Imputed' ? '#E69F00' : '#0072B2')
            .attr('opacity', 0.75);

        // Axis Labels
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - 10)
            .attr('text-anchor', 'middle')
            .attr('fill', 'black')
            .text(xKey);

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', margin.left / 3)
            .attr('text-anchor', 'middle')
            .attr('fill', 'black')
            .text(yKey);

        svg
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMinYMin meet')
            .attr('width', '100%')
            .attr('height', '100%');
    };

    return (
        <ChartWrapper
            title="Plot of Imputed Values on Dataset"
            tooltipContent={<p>Scatter plot showing original vs. imputed values for the selected feature.</p>}
            modalContent={<ImputedScatterPlot inModal />}
            inModal={inModal}
            fixed={true}
        >
            <div style={{ display: 'flex', gap: '0.5rem', padding:'10px' }}>
                <Select
                    size="small"
                    style={{ width: 180 }}
                    placeholder="Select X-axis"
                    onChange={val => setXColumn(val)}
                    value={xColumn}
                >
                    {columns.map(col => (
                        <Select.Option key={col} value={col}>{col}</Select.Option>
                    ))}
                </Select>
                <Select
                    size="small"
                    style={{ width: 180 }}
                    placeholder="Select Y-axis"
                    onChange={val => setYColumn(val)}
                    value={yColumn}
                >
                    {imputedColumns.map(col => (
                        <Select.Option key={col} value={col}>{col}</Select.Option>
                    ))}
                </Select>
            </div>
            <div ref={containerRef} style={{ flex: 1 }}>
                <Spin spinning={loading}>
                    <svg ref={svgRef} width="100%" height="100%" />
                </Spin>
            </div>
        </ChartWrapper>
    );
};

export default ImputedScatterPlot;
