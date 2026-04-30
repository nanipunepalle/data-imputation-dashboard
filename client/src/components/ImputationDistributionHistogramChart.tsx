'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Select, Spin } from 'antd';
import { fetchColumnDistribution, fetchMissingnessSummary } from '@/services/apiService';
import ChartWrapper from '@/components/ChartWrapper';
import { useDatasetStore } from '@/store/useDataStore';

type HistogramScaleLock = {
    xDomain: [number, number];
    yMax: number;
};

const HISTOGRAM_BIN_COUNT = 20;

const getRobustDomain = (values: number[]): [number, number] | null => {
    const finiteValues = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (!finiteValues.length) return null;

    const extent = d3.extent(finiteValues);
    if (extent[0] == null || extent[1] == null) return null;

    const p01 = d3.quantileSorted(finiteValues, 0.01);
    const p99 = d3.quantileSorted(finiteValues, 0.99);

    let min = p01 ?? extent[0];
    let max = p99 ?? extent[1];

    if (min === max) {
        min = extent[0];
        max = extent[1];
    }

    if (min === max) {
        const pad = min === 0 ? 1 : Math.abs(min) * 0.05;
        min -= pad;
        max += pad;
    }

    return [min, max];
};

const ImputationDistributionHistogramChart: React.FC<{ inModal?: boolean }> = ({ inModal }) => {
    const { dataset, isUpdated, chartsReset } = useDatasetStore();
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const scaleLockRef = useRef<Record<string, HistogramScaleLock>>({});
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

        fetchColumnDistribution(selectedColumn)
            .then(({ original, imputed }) => {
                drawHistogram(original, imputed, selectedColumn);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [selectedColumn, dataset, isUpdated]);

    // New upload/dataset should use fresh scale locks.
    useEffect(() => {
        scaleLockRef.current = {};
    }, [dataset]);

    // Reset chart when chartsReset state changes
    useEffect(() => {
        if (svgRef.current) {
            const svg = d3.select(svgRef.current);
            svg.selectAll('*').remove();
        }
        scaleLockRef.current = {};
    }, [chartsReset]);

    const drawHistogram = (original: number[], imputed: number[], columnKey: string) => {
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const containerWidth = containerRef.current!.clientWidth;
        const containerHeight = containerRef.current!.clientHeight;

        const width = Math.max(320, containerWidth || 0);
        const height = Math.max(inModal ? 320 : 240, containerHeight || 0);
        const margin = { top: 10, right: 30, bottom: 70, left: 60 };

        const baselineDomain = getRobustDomain(original);
        if (!baselineDomain) return;

        const lockedScale = scaleLockRef.current[columnKey];
        let xDomain: [number, number];
        let yMax: number;

        if (lockedScale) {
            xDomain = lockedScale.xDomain;
            yMax = lockedScale.yMax;
        } else {
            xDomain = baselineDomain;
            const baselineBinGen = d3.bin<number, number>()
                .domain(xDomain)
                .thresholds(HISTOGRAM_BIN_COUNT);
            const baselineOrigBins = baselineBinGen(original);
            const baselineImpBins = baselineBinGen(imputed);

            // Baseline stacked peak is locked for this feature across method switching.
            const baselinePeak = d3.max(
                baselineOrigBins.map((bin, i) => bin.length + (baselineImpBins[i]?.length ?? 0))
            ) ?? 0;
            yMax = Math.max(1, Math.ceil(baselinePeak * 1.1));
            scaleLockRef.current[columnKey] = { xDomain, yMax };
        }

        const x = d3.scaleLinear()
            .domain(xDomain)
            .nice()
            .range([margin.left, width - margin.right]);


        const binGen = d3.bin<number, number>()
            .domain(x.domain() as [number, number])
            .thresholds(HISTOGRAM_BIN_COUNT);

        const origBins = binGen(original);
        const impBins = binGen(imputed);

        const y = d3.scaleLinear()
            .domain([0, yMax])
            .nice()
            .range([height - margin.bottom, margin.top]);

        // Axes
        svg.append('g')
            .attr('transform', `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x))
            .selectAll("text")
            .attr("transform", "rotate(45)")
            .style("text-anchor", "start");

        svg.append('g')
            .attr('transform', `translate(${margin.left},0)`)
            .call(d3.axisLeft(y));


        // Original bars: blue, drawn first
        svg.selectAll('.bar-original')
            .data(origBins)
            .enter()
            .append('rect')
            .attr('x', d => x(d.x0!) + 1)
            .attr('y', (d, i) => y(d.length))
            .attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 2))
            .attr('height', d => y(0) - y(d.length))
            .attr('fill', '#0072B2');

        // Imputed bars: orange, drawn second on top of original
        svg.selectAll('.bar-imputed')
            .data(impBins)
            .enter()
            .append('rect')
            .attr('x', d => x(d.x0!) + 1)
            .attr('y', (d, i) => y(origBins[i].length + d.length)) // stacked on top of original
            .attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 2))
            .attr('height', (d, i) => y(origBins[i].length) - y(origBins[i].length + d.length))
            .attr('fill', 'orange');


        // Labels
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height - 10)
            .attr('text-anchor', 'middle')
            .attr('fill', 'black')
            .text('Value Bins');

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', margin.left / 3)
            .attr('text-anchor', 'middle')
            .attr('fill', 'black')
            .text('Frequency');

        // Legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width - 150},${margin.top})`);

        legend.append('rect').attr('x', 0).attr('y', 0).attr('width', 15).attr('height', 15).attr('fill', 'orange');
        legend.append('text').attr('x', 20).attr('y', 12).attr('fill', 'black').text('Imputed');

        legend.append('rect').attr('x', 0).attr('y', 25).attr('width', 15).attr('height', 15).attr('fill', 'steelblue');
        legend.append('text').attr('x', 20).attr('y', 37).attr('fill', 'black').text('Original');

        svg
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMinYMin meet')
            .attr('width', '100%')
            .attr('height', '100%');
    };

    return (
        <ChartWrapper
            title="Histogram"
            tooltipContent={<p>Select a column to compare distribution of original and imputed values.</p>}
            modalContent={<ImputationDistributionHistogramChart inModal />}
            inModal={inModal}
            fixed={true}
            controls={
                <Select
                    size="small"
                    style={{ width: 160 }}
                    placeholder="Select an Imputed Feature"
                    onChange={val => setSelectedColumn(val)}
                    value={selectedColumn}
                >
                    {columns.map(col => (
                        <Select.Option key={col} value={col}>{col}</Select.Option>
                    ))}
                </Select>
            }
        >
            <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <Spin spinning={loading}>
                    <svg ref={svgRef} width="100%" height="100%" />
                </Spin>
            </div>
        </ChartWrapper>
    );
};

export default ImputationDistributionHistogramChart;
