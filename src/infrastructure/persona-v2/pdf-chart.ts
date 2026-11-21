import * as echarts from "echarts";
import sharp from "sharp";
import type { PdfRenderInput } from "../../domain/ports/persona-pdf-renderer.port.js";
import { formatPdfCell } from "../../domain/persona-v2/pdf-format.js";

// The dedicated renderer has one CPU and a fixed PID budget. Do not size native
// work pools from the host CPU count exposed through a container.
sharp.concurrency(1);
sharp.cache(false);

/** No options, markup, expressions or resources originate from the consumer. */
export async function renderPdfChart(
  input: PdfRenderInput,
  width: number,
  height: number,
): Promise<Buffer> {
  const chart = input.chart!;
  const maximum = chart.kind === "pie" ? 6 : chart.kind === "bar" ? 30 : 200;
  if (
    !input.rows.length ||
    input.rows.length > maximum ||
    chart.categoryIndex === chart.valueIndex ||
    chart.categoryIndex >= input.columns.length ||
    chart.valueIndex >= input.columns.length
  )
    throw new Error("PDF_INPUT_INVALID");
  const categories: string[] = [];
  const values: (number | null)[] = [];
  for (const row of input.rows) {
    const category = row[chart.categoryIndex];
    const raw = row[chart.valueIndex];
    if (!category || category.length > 40) throw new Error("PDF_INPUT_INVALID");
    const label = formatPdfCell(category, input.formats?.[chart.categoryIndex]);
    if (categories.includes(label)) throw new Error("PDF_INPUT_INVALID");
    categories.push(label);
    if (raw === null && chart.kind !== "pie") {
      values.push(null);
      continue;
    }
    // Number is only geometry. The table retains the original decimal string.
    if (typeof raw !== "string" || !/^-?\d{1,12}(?:\.\d{1,6})?$/.test(raw))
      throw new Error("PDF_INPUT_INVALID");
    const value = Number(raw);
    if (!Number.isFinite(value) || (chart.kind === "pie" && value < 0))
      throw new Error("PDF_INPUT_INVALID");
    values.push(value);
  }
  if (
    values.every((value) => value === null) ||
    (chart.kind === "pie" && values.every((value) => value === 0))
  )
    throw new Error("PDF_INPUT_INVALID");
  const instance = echarts.init(null, undefined, { renderer: "svg", ssr: true, width, height });
  try {
    instance.setOption({
      animation: false,
      backgroundColor: "#ffffff",
      textStyle: { fontFamily: "Noto Sans", fontSize: 10 },
      tooltip: { show: false },
      ...(chart.kind === "pie"
        ? {
            series: [
              {
                type: "pie",
                radius: "55%",
                label: { formatter: "{b}" },
                data: categories.map((name, i) => ({ name, value: values[i] })),
              },
            ],
          }
        : {
            grid: { left: 65, right: 25, bottom: 110, top: 35 },
            xAxis: {
              type: "category",
              data: categories,
              axisLabel: { rotate: 45, hideOverlap: true },
            },
            yAxis: {
              type: "value",
              name: chart.unit === "BRL" ? "R$" : chart.unit === "percent" ? "%" : "Quantidade",
              scale: false,
              axisLabel: {
                formatter: (value: number) =>
                  value.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }),
              },
            },
            series: [
              {
                type: chart.kind,
                data: values,
                connectNulls: false,
                color: "#226b55",
                showSymbol: true,
              },
            ],
          }),
    });
    const svg = instance.renderToSVGString();
    if (
      Buffer.byteLength(svg) > 1024 * 1024 ||
      /<(?:image|script|foreignObject)\b|(?:href|xlink:href)\s*=/i.test(svg)
    )
      throw new Error("PDF_INPUT_INVALID");
    return await sharp(Buffer.from(svg), { density: 144, limitInputPixels: 8_000_000 })
      .png()
      .toBuffer();
  } finally {
    instance.dispose();
  }
}
