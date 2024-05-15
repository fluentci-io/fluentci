const kv = await Deno.openKv();

export type Pagination = {
  limit?: number;
  cursor?: string;
  reverse?: boolean;
};

export default kv;
