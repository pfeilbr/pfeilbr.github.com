summaryInclude = 60;
let savedChildren = null;
const cache = {};

var fuseOptions = {
  shouldSort: true,
  includeMatches: true,
  threshold: 0.0,
  tokenize: true,
  location: 0,
  distance: 100,
  maxPatternLength: 32,
  minMatchCharLength: 1,
  keys: [
    { name: "title", weight: 0.8 },
    { name: "tags", weight: 0.7 },
    { name: "contents", weight: 0.5 },
    { name: "postedOnDate", weight: 0.3 },
  ],
};

document.getElementById(
  "search-query"
).placeholder = `search posts (${postCount})`; // `search ${postCount} posts`

function executeInlineSearch() {
  $(".search-results-empty").remove();
  $(".search-results-summary").remove();

  var query = document.getElementById("search-query").value;

  if (cache.lastSearchQuery && cache.lastSearchQuery === query) {
    return;
  }

  const children = $("#search-results").children();
  if (query && query.length > 0) {
    if (savedChildren === null) {
      savedChildren = children.clone();
    }
    children.remove();
    executeSearch(query, true);
    cache.lastSearchQuery = query;
  } else {
    if (savedChildren !== null) {
      const cloned = savedChildren.clone();
      children.remove();
      $("#search-results").append(cloned);
      savedChildren = null;
    }
  }
}

function getSearchIndex(cb) {
  if (cache["searchIndex"]) {
    return cb(cache["searchIndex"]);
  } else {
    $.getJSON("/index.json", function (data) {
      const fuse = new Fuse(data, fuseOptions);
      cache["searchIndex"] = fuse;
      return cb(cache["searchIndex"]);
    });
  }
}

function debounce(func, wait, immediate) {
  var timeout;
  return function () {
    var context = this,
      args = arguments;
    var later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

function executeSearchImpl(searchQuery, clear_list) {
  getSearchIndex(function (fuse) {
    var result = fuse.search(searchQuery);
    if (result.length > 0) {
      populateResults(result);
    } else {
      if (clear_list) {
        $(".search-results-empty").remove();
      }
      $("#search-results").append(
        '<p class="search-results-empty">No matches found</p>'
      );
    }
  });
}

const executeSearch = debounce(executeSearchImpl, 500);

function populateResults(result) {
  searchQuery = document.getElementById("search-query").value;
  $.each(result, function (key, value) {
    let contents = value.item.contents;
    let snippet = "";
    let snippetHighlights = [];
    let tags = [];
    if (fuseOptions.tokenize) {
      snippetHighlights.push(searchQuery);
    } else {
      $.each(value.matches, function (matchKey, mvalue) {
        if (mvalue.key == "tags") {
          snippetHighlights.push(mvalue.value);
        } else if (mvalue.key == "contents") {
          start =
            mvalue.indices[0][0] - summaryInclude > 0
              ? mvalue.indices[0][0] - summaryInclude
              : 0;
          end =
            mvalue.indices[0][1] + summaryInclude < contents.length
              ? mvalue.indices[0][1] + summaryInclude
              : contents.length;
          snippet += contents.substring(start, end);
          snippetHighlights.push(
            mvalue.value.substring(
              mvalue.indices[0][0],
              mvalue.indices[0][1] - mvalue.indices[0][0] + 1
            )
          );
        }
      });
    }

    if (snippet.length < 1) {
      snippet += contents.substring(0, summaryInclude * 2);
    }

    const templateDefinition = $("#search-result-template").html();

    tags = "";
    if (value.item.tags) {
      tags = value.item.tags
        .map(function (element) {
          return "<a href='/tags/" + element + "'>" + "" + element + "</a>";
        })
        .join(", ");
    }

    var output = render(templateDefinition, {
      key: key,
      title: value.item.title,
      link: value.item.permalink,
      tags: tags,
      categories: value.item.categories,
      snippet: snippet,
      postedOnDate: value.item.postedOnDate,
    });
    $("#search-results").append(output);

    $.each(snippetHighlights, function (snipkey, snipvalue) {
      $("#summary-" + key).mark(snipvalue);
    });
  });
}

function param(name) {
  return decodeURIComponent(
    (location.search.split(name + "=")[1] || "").split("&")[0]
  ).replace(/\+/g, " ");
}

function render(templateString, data) {
  var conditionalMatches, conditionalPattern, copy;
  conditionalPattern = /\$\{\s*isset ([a-zA-Z]*) \s*\}(.*)\$\{\s*end\s*}/g;
  //since loop below depends on re.lastInxdex, we use a copy to capture any manipulations whilst inside the loop
  copy = templateString;
  while (
    (conditionalMatches = conditionalPattern.exec(templateString)) !== null
  ) {
    if (data[conditionalMatches[1]]) {
      //valid key, remove conditionals, leave contents.
      copy = copy.replace(conditionalMatches[0], conditionalMatches[2]);
    } else {
      //not valid, remove entire section
      copy = copy.replace(conditionalMatches[0], "");
    }
  }
  templateString = copy;
  //now any conditionals removed we can do simple substitution
  var key, find, re;
  for (key in data) {
    find = "\\$\\{\\s*" + key + "\\s*\\}";
    re = new RegExp(find, "g");
    templateString = templateString.replace(re, data[key]);
  }
  return templateString;
}
