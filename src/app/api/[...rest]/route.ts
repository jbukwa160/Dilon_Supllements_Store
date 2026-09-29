// Unknown /api/* addresses get a JSON 404 instead of falling through to the storefront (app/[lang] with lang="api").
const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

export { notFound as GET, notFound as HEAD, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE, notFound as OPTIONS };
