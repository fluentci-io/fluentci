const kv = await Deno.openKv();

export type Pagination = {
  limit?: number;
  cursor?: string;
};

export default kv;
