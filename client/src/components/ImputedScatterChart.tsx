'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Select, Spin, Typography } from 'antd';
import ChartWrapper from '@/components/ChartWrapper';
import { useDatasetStore } from '@/store/useDataStore';
import { fetchDataTypes, fetchMissingnessSummary, fetchScatterPlotData } from '@/services/apiService';

const { Text } = Typography;

const ImputedScatterPlot: React.FC<{ inModal?: boolean }> = ({ inModal }) => {
    const { dataset, isUpdated } = useDatasetStore();
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const [columns, setColumns] = useState<string[]>([]);
    const [imputedColumns, setImputedColumns] = useState<string[]>([]);
    const [xColumn, setXColumn] = useState<string | null>(null);
    const [yColumn, setYColumn] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Load ALL columns from dtypes
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const dtypes = await fetchDataTypes(); // Record<string, string>
                const cols = Object.keys(dtypes);
                if (!cancelled) {
                    setColumns(cols);
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

    // Load columns that had missingness (imputed candidates)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const summary = await fetchMissingnessSummary();
                const cols = summary.filter((s: any) => s.percent > 0).map((s: any) => s.feature);
                if (!cancelled) setImputedColumns(cols);
            } catch (e) {
                console.error('Error loading missingness summary:', e);
                if (!cancelled) setImputedColumns([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [dataset, isUpdated]);

    // Ensure default selections pick the first available option
    useEffect(() => {
        if (columns.length > 0) {
            if (!xColumn || !columns.includes(xColumn)) {
                setXColumn(columns[0]);
            }
        } else {
            setXColumn(null);
        }
    }, [columns]);

    useEffect(() => {
        if (imputedColumns.length > 0) {
            if (!yColumn || !imputedColumns.includes(yColumn)) {
                setYColumn(imputedColumns[0]);
            }
        } else {
            setYColumn(null);
        }
    }, [imputedColumns]);

    // Fetch plot data when both selections exist
    useEffect(() => {
        if (!xColumn || !yColumn || !svgRef.current || !containerRef.current) return;
        let cancelled = false;
        setLoading(true);
        fetchScatterPlotData(xColumn, yColumn)
            .then((data) => {
                if (cancelled) return;
                drawScatter(data.points || [], xColumn, yColumn);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Scatter fetch error:', err);
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [xColumn, yColumn, dataset, isUpdated]);

    const drawScatter = (points: any[], xKey: string, yKey: string) => {
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const containerWidth = containerRef.current!.clientWidth || 600;
        const containerHeight = containerRef.current!.clientHeight || 360;
        const width = containerWidth;
        const height = containerHeight;

        const margin = { top: 10, right: 30, bottom: 60, left: 60 };

        const xExtent = d3.extent(points, (d: any) => d.x) as [number, number] | [undefined, undefined];
        const yExtent = d3.extent(points, (d: any) => d.y) as [number, number] | [undefined, undefined];

        const xDomain: [number, number] = [
            xExtent[0] ?? 0,
            xExtent[1] ?? 1,
        ];
        const yDomain: [number, number] = [
            yExtent[0] ?? 0,
            yExtent[1] ?? 1,
        ];

        const x = d3.scaleLinear().domain(xDomain).nice().range([margin.left, width - margin.right]);
        const y = d3.scaleLinear().domain(yDomain).nice().range([height - margin.bottom, margin.top]);

        // Axes
        svg
            .append('g')
            .attr('transform', `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x))
            .selectAll('text')
            .attr('transform', 'rotate(45)')
            .style('text-anchor', 'start');

        svg
            .append('g')
            .attr('transform', `translate(${margin.left},0)`)
            .call(d3.axisLeft(y));

        // Points
        svg
            .selectAll('.dot')
            .data(points)
            .enter()
            .append('circle')
            .attr('cx', (d: any) => x(d.x))
            .attr('cy', (d: any) => y(d.y))
            .attr('r', 3)
            .attr('fill', (d: any) => (d.label === 'Imputed' ? '#E69F00' : '#0072B2'))
            .attr('opacity', 0.75);

        // Axis Labels
        svg
            .append('text')
            .attr('x', width / 2)
            .attr('y', height - 10)
            .attr('text-anchor', 'middle')
            .attr('fill', 'black')
            .text(xKey);

        svg
            .append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', margin.left / 3)
            .attr('text-anchor', 'middle')
            .attr('fill', 'black')
            .text(yKey);

        // Legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width - margin.right - 40}, ${margin.top})`);

        const legendItems = [
            { label: 'Original', color: '#0072B2' },
            { label: 'Imputed', color: '#E69F00' },
        ];

        legendItems.forEach((item, i) => {
            const g = legend.append('g').attr('transform', `translate(0, ${i * 20})`);

            g.append('circle')
                .attr('cx', 0)
                .attr('cy', 0)
                .attr('r', 5)
                .style('fill', item.color)
                .style('opacity', 0.75);

            g.append('text')
                .attr('x', 12)
                .attr('y', 5)
                .style('font-size', '12px')
                .style('fill', 'black')
                .text(item.label);
        });


        svg.attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'xMinYMin meet').attr('width', '100%').attr('height', '100%');
    };

    return (
        <ChartWrapper
            title="Scatter Plot: Original vs Imputed Values"
            tooltipContent={<p>Scatter plot showing original vs. imputed values for the selected feature.</p>}
            modalContent={<ImputedScatterPlot inModal />}
            inModal={inModal}
            fixed={true}
        >
            <div style={{ display: 'flex', gap: '0.5rem', padding: '10px' }}>
                <div>
                    <Text type="secondary">X</Text>
                    <Select
                        size="small"
                        style={{ width: 180, marginLeft: 8 }}
                        placeholder="Select X-axis"
                        onChange={(val) => setXColumn(val)}
                        value={xColumn ?? undefined}
                    >
                        {columns.map((col) => (
                            <Select.Option key={col} value={col}>
                                {col}
                            </Select.Option>
                        ))}
                    </Select>
                </div>
                <div>
                    <Text type="secondary">Y</Text>
                    <Select
                        size="small"
                        style={{ width: 180, marginLeft: 8 }}
                        placeholder="Select Y-axis"
                        onChange={(val) => setYColumn(val)}
                        value={yColumn ?? undefined}
                    >
                        {imputedColumns.map((col) => (
                            <Select.Option key={col} value={col}>
                                {col}
                            </Select.Option>
                        ))}
                    </Select>
                </div>
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
