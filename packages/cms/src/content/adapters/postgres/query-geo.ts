import { fail } from '@new-cms/cms/platform/contracts';
import type { JsonValue, QueryOperator } from '../../definition.ts';
import type { FieldMapping } from '../../model.ts';
import { objectValue } from '../../fields/json-value.ts';
import { parameter } from './query-context.ts';
import type { QueryContext } from './query-context.ts';

type Point = [number, number];

function coordinate(value: JsonValue, context: QueryContext): Point {
  context.budget.nodes += 1;
  if (context.budget.nodes > context.limits.maxQueryNodes) fail('invalid_input');
  if (!Array.isArray(value) || value.length !== 2) fail('invalid_input');
  const [longitude, latitude] = value;
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  )
    fail('invalid_input');
  return [longitude, latitude];
}

function points(value: JsonValue, context: QueryContext, minimum: number): Point[] {
  if (!Array.isArray(value) || value.length < minimum) fail('invalid_input');
  return value.map((entry) => coordinate(entry, context));
}

function pointToken(value: Point): string {
  return `(${value[0]},${value[1]})`;
}

function line(input: {
  value: JsonValue;
  expression: string;
  context: QueryContext;
  boundary: boolean;
}): string {
  const path = points(input.value, input.context, 2);
  const [start] = path;
  const end = path.at(-1);
  if (!start || !end) fail('invalid_input');
  const token = parameter(input.context, `[${path.map(pointToken).join(',')}]`);
  const on = `${input.expression} <@ ${token}::path`;
  if (input.boundary) return `(${on})`;
  const first = parameter(input.context, pointToken(start));
  const last = parameter(input.context, pointToken(end));
  return `(${on} AND NOT (${input.expression} ~= ${first}::point OR ${input.expression} ~= ${last}::point))`;
}

function polygon(input: {
  value: JsonValue;
  expression: string;
  context: QueryContext;
  boundary: boolean;
}): string {
  if (!Array.isArray(input.value) || input.value.length === 0) fail('invalid_input');
  const rings = input.value.map((value) => {
    const ring = points(value, input.context, 4);
    const [first] = ring;
    const last = ring.at(-1);
    if (!first || !last) fail('invalid_input');
    if (first[0] !== last[0] || first[1] !== last[1]) fail('invalid_input');
    const token = parameter(input.context, `(${ring.map(pointToken).join(',')})`);
    return {
      inside: `${input.expression} <@ ${token}::polygon`,
      edge: () =>
        `${input.expression} <@ ${parameter(input.context, `[${ring.map(pointToken).join(',')}]`)}::path`,
    };
  });
  const [outer] = rings;
  if (!outer) fail('invalid_input');
  const conditions = [outer.inside];
  if (!input.boundary) conditions.push(`NOT (${outer.edge()})`);
  for (const hole of rings.slice(1))
    conditions.push(
      input.boundary ? `NOT (${hole.inside} AND NOT (${hole.edge()}))` : `NOT (${hole.inside})`,
    );
  return `(${conditions.join(' AND ')})`;
}

function geometry(input: {
  value: JsonValue;
  expression: string;
  context: QueryContext;
  boundary: boolean;
  depth: number;
}): string {
  if (input.depth > input.context.limits.maxQueryDepth || !objectValue(input.value))
    fail('invalid_input');
  const { type, coordinates, geometries } = input.value;
  if (Object.keys(input.value).some((key) => !['type', 'coordinates', 'geometries'].includes(key)))
    fail('invalid_input');
  if (type === 'GeometryCollection') {
    if (!Array.isArray(geometries) || geometries.length === 0 || coordinates !== undefined)
      fail('invalid_input');
    return `(${geometries.map((value) => geometry({ ...input, value, depth: input.depth + 1 })).join(' OR ')})`;
  }
  if (coordinates === undefined || geometries !== undefined) fail('invalid_input');
  if (type === 'Point')
    return `${input.expression} ~= ${parameter(input.context, pointToken(coordinate(coordinates, input.context)))}::point`;
  if (type === 'LineString') return line({ ...input, value: coordinates });
  if (type === 'Polygon') return polygon({ ...input, value: coordinates });
  return multiGeometry(input, type, coordinates);
}

function multiGeometry(
  input: Parameters<typeof geometry>[0],
  type: JsonValue | undefined,
  coordinates: JsonValue,
): string {
  const multiTypes: Readonly<Record<string, string>> = {
    MultiPoint: 'Point',
    MultiLineString: 'LineString',
    MultiPolygon: 'Polygon',
  };
  const base =
    typeof type === 'string' && Object.hasOwn(multiTypes, type) ? multiTypes[type] : undefined;
  if (!base || !Array.isArray(coordinates) || coordinates.length === 0) fail('invalid_input');
  return `(${coordinates.map((value) => geometry({ ...input, value: { type: base, coordinates: value }, depth: input.depth + 1 })).join(' OR ')})`;
}

function near(value: JsonValue, expression: string, context: QueryContext): string {
  if (!Array.isArray(value) || value.length !== 4) fail('invalid_input');
  const [, , maximum, minimum] = value;
  for (const distance of [minimum, maximum])
    if (
      distance !== null &&
      (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0)
    )
      fail('invalid_input');
  if (minimum === null && maximum === null) fail('invalid_input');
  if (typeof minimum === 'number' && typeof maximum === 'number' && minimum > maximum)
    fail('invalid_input');
  const distance = distanceExpression(value, expression, context);
  return `(${[typeof minimum === 'number' ? `${distance}>=${parameter(context, minimum)}` : '', typeof maximum === 'number' ? `${distance}<=${parameter(context, maximum)}` : ''].filter(Boolean).join(' AND ')})`;
}

export function distanceExpression(
  value: JsonValue,
  expression: string,
  context: QueryContext,
): string {
  if (!Array.isArray(value) || value.length !== 4) fail('invalid_input');
  const [longitude, latitude] = coordinate(value.slice(0, 2), context);
  const lng = parameter(context, longitude);
  const lat = parameter(context, latitude);
  const x = `((${expression}->>0)::double precision)`;
  const y = `((${expression}->>1)::double precision)`;
  return `cms_wgs84_distance(${x},${y},${lng}::double precision,${lat}::double precision)`;
}

export function planarDistanceExpression(
  value: JsonValue,
  expression: string,
  context: QueryContext,
): string {
  if (!Array.isArray(value) || value.length !== 4) fail('invalid_input');
  const [longitude, latitude] = coordinate(value.slice(0, 2), context);
  const lng = parameter(context, longitude);
  const lat = parameter(context, latitude);
  return `(power(((${expression}->>0)::double precision)-${lng},2)+power(((${expression}->>1)::double precision)-${lat},2))`;
}

export function geoComparison(input: {
  expression: string;
  operator: QueryOperator;
  value: JsonValue;
  field?: FieldMapping;
  context: QueryContext;
}): string {
  if (input.field?.field.type !== 'point') fail('invalid_input');
  if (input.operator === 'near') return near(input.value, input.expression, input.context);
  return geometry({
    ...input,
    expression: `point((${input.expression}->>0)::double precision,(${input.expression}->>1)::double precision)`,
    boundary: input.operator === 'intersects',
    depth: 1,
  });
}
