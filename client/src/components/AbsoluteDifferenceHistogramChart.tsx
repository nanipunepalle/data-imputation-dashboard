'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Select, Spin } from 'antd';
import ChartWrapper from '@/components/ChartWrapper';
import { useDatasetStore } from '@/store/useDataStore';
import { fetchMissingnessSummary, fetchTestEvaluation } from '@/services/apiService';

const AbsoluteDifferenceHistogram: React.FC<{ inModal?: boolean }> = ({ inModal }) => {
    const { dataset, isUpdated } = useDatasetStore();
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchMissingnessSummary().then(summary => {
            const cols = summary.filter(s => s.percent > 0).map(s => s.feature);
            setColumns(cols);
            cols.length > 0 && setSelectedColumn(cols[0])
        });
    }, [dataset, isUpdated]);

    useEffect(() => {
        if (!selectedColumn || !svgRef.current || !containerRef.current) return;
        setLoading(true);

        fetchTestEvaluation()
            .then(data => {
                const filtered = data.test_evaluation.filter((d: any) => d.column === selectedColumn);
                const values = filtered.map((d: any) => d.absolute_diff);
                drawHistogram(values);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [selectedColumn, dataset, isUpdated]);

    const drawHistogram = (values: number[]) => {
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const containerWidth = containerRef.current!.clientWidth;
        const containerHeight = containerRef.current!.clientHeight;
        const width = containerWidth;
        const height = containerHeight;
        const margin = { top: 10, right: 30, bottom: 60, left: 60 };

        const x = d3.scaleLinear()
            .domain(d3.extent(values) as [number, number])
            .nice()
            .range([margin.left, width - margin.right]);

        const bins = d3.bin().domain(x.domain() as [number, number]).thresholds(20)(values);

        const y = d3.scaleLinear()
            .domain([0, d3.max(bins, d => d.length) || 0])
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

        svg.selectAll('.bar')
            .data(bins)
            .enter()
            .append('rect')
            .attr('x', d => x(d.x0!) + 1)
            .attr('y', d => y(d.length))
            .attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 2))
            .attr('height', d => y(0) - y(d.length))
            .attr('fill', '#0072B2');

        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - 10)
            .attr('text-anchor', 'middle')
            .attr('fill', 'black')
            .text('Absolute Difference');

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', margin.left / 3)
            .attr('text-anchor', 'middle')
            .attr('fill', 'black')
            .text('Frequency');

        svg
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMinYMin meet')
            .attr('width', '100%')
            .attr('height', '100%');
    };

    return (
        <ChartWrapper
            title="Absolute Difference Distribution"
            tooltipContent={<p>Histogram of absolute difference between original and imputed values on 20% test data.</p>}
            modalContent={<AbsoluteDifferenceHistogram inModal />}
            inModal={inModal}
            fixed={true}
            controls={<Select
                size="small"
                style={{ width: 160 }}
                placeholder="Select Column"
                onChange={val => setSelectedColumn(val)}
                value={selectedColumn}
            >
                {columns.map(col => (
                    <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
            </Select>}
        >
            <div ref={containerRef} style={{ flex: 1 }}>
                <Spin spinning={loading}>
                    <svg ref={svgRef} width="100%" height="100%" />
                </Spin>
            </div>
        </ChartWrapper>
    );
};

export default AbsoluteDifferenceHistogram;
