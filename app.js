const _ = require("lodash");
const express = require("express");

const app = express();

const PORT = 3000;

const FETCH_OPTIONS = {
    method: "GET",
    headers: {
        "x-hasura-admin-secret": "32qR4KmXOIpsGPQKMqEJHGJS27G5s7HdSKO3gdtQd2kv5e852SiYwWNfxkZOBuQ6"
    }
};

const URL = 'https://intent-kit-16.hasura.app/api/rest/blogs';

let searchBlogsCache = null;
let analyzeBlogsCache = null;

const ANALYZED_BLOGS_CACHE_KEY = "analyzedBlogs";
const FILTERED_BLOGS_CACHE_KEY = "filteredBlogs";

function cacheData(func, cacheKey, timeout) {
    const cache = _.memoize(func, () => cacheKey);

    // Timeout to expire cache after the specified time in ms
    setTimeout(() => {
        if (cacheKey === FILTERED_BLOGS_CACHE_KEY && searchBlogsCache) {
            try {
                console.log(`Cache expired for key "${cacheKey}"`);

                searchBlogsCache.cache && searchBlogsCache.cache.clear();
                searchBlogsCache = null;
            } catch (error) {
                console.error(`Error clearing cache for key ${cacheKey}: ${error}`);
            }
        }

        if (cacheKey === ANALYZED_BLOGS_CACHE_KEY && analyzeBlogsCache) {
            try {
                console.log(`Cache expired for key "${cacheKey}"`);

                analyzeBlogsCache.cache && analyzeBlogsCache.cache.clear();
                analyzeBlogsCache = null;
            } catch (error) {
                console.error(`Error clearing cache for key ${cacheKey}: ${error}`);
            }
        }
    }, timeout);

    return cache;
}

async function fetchBlogs() {
    try {
        const response = await fetch(URL, FETCH_OPTIONS);

        if (!response.ok) {
            throw new Error(`Error! Failed to fetch blogs: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        const blogs = data.blogs;

        if (!Array.isArray(blogs)) {
            throw new Error("Unable to parse blogs");
        }

        return blogs;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

app.get("/api/blog-stats", async (_req, res) => {
    try {
        if (!analyzeBlogsCache) {
            analyzeBlogsCache = cacheData(async () => {
                const blogs = await fetchBlogs();

                const totalNumOfBlogs = _.size(blogs);
                const blogWithLongestTitle = _.maxBy(blogs, blog => blog.title.length).title;
                const numOfBlogsContainingTheWordPrivacy = _.filter(blogs, blog => _.includes(blog.title.toLowerCase(), 'privacy')).length;
                const uniqueBlogTitleArray = _.uniqBy(blogs, blog => blog.title).map(blog => blog.title);

                return {
                    totalNumOfBlogs,
                    blogWithLongestTitle,
                    numOfBlogsContainingTheWordPrivacy,
                    uniqueBlogTitleArray
                };

            }, ANALYZED_BLOGS_CACHE_KEY, 10000);
        }

        const responseObject = await analyzeBlogsCache();

        res.json(responseObject);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/blog-search", async (req, res) => {
    try {
        const query = req.query.query;

        if (!query) {
            return res.status(400).json({ error: "Query parameter is required." });
        }

        if (!searchBlogsCache) {
            searchBlogsCache = cacheData(async () => {
                const blogs = await fetchBlogs();

                return _.filter(blogs, blog => _.includes(blog.title.toLowerCase(), query.toLowerCase()));
            }, FILTERED_BLOGS_CACHE_KEY, 10000);
        }

        const filteredBlogs = await searchBlogsCache();

        if (filteredBlogs.length === 0) {
            res.status(404).json({ error: `No matching blogs found for ${query.toLowerCase()}` });
        } else {
            res.json(filteredBlogs);
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
});
