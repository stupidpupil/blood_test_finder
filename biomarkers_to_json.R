readr::read_csv("biomarkers.csv", col_types="cccn") |> 
  tidyr::replace_na(list(synonyms = "", score = 1)) |>
  dplyr::arrange(-score) |>
  jsonlite::write_json("biomarkers.json", pretty=TRUE)