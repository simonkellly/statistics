import { QuestionCircleOutlined } from "@ant-design/icons";
import CodeMirror, { EditorView, Prec, keymap } from '@uiw/react-codemirror';
import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Pagination,
  Skeleton,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import databaseQueryApi from "../api/DatabaseQueryApi";
import DatabaseQueryOptions from "../components/DatabaseQueryOptions";
import NoContent from "../components/NoContent";
import StatisticsTable from "../components/StatisticsTable";
import { DatabaseMetaData } from "../model/QueryDatabase";
import { getQueryParameter, setQueryParameter } from "../util/query.param.util";
import "./DatabaseQueryPage.css";

const { TextArea } = Input;
import { MySQL, sql } from "@codemirror/lang-sql";
import { androidstudio } from "@uiw/codemirror-theme-androidstudio";

const SQL_QUERY = "sqlQuery";

interface ReplaceItem {
  key: string;
  value: string;
}

export const DatabaseQueryPage = () => {
  const [query, setQuery] = useState(getQueryParameter(SQL_QUERY) || "");
  const [queryResults, setQueryResults] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [noResult, setNoResult] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalElements, setTotalElements] = useState<number>(0);
  const [lastSearchedQuery, setLastSearchedQuery] = useState<string>();
  const [replaceList, setReplaceList] = useState<ReplaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [positionTieBreakerIndex, setPositionTieBreakerIndex] =
    useState<number>();
  const [showPositions, setShowPositions] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [metaData, setMetaData] = useState<DatabaseMetaData>();
  const [informationOpen, setInformationOpen] = useState(false);

  const toggleModal = () => setModalOpen((f) => !f);

  const fetchMeta = useCallback(() => {
    databaseQueryApi.queryDatabaseMeta().then((response) => {
      setMetaData(response.data);
    });
  }, []);

  useEffect(fetchMeta, [fetchMeta]);

  // We allow common replacement with the form :ALL_UPPER
  useEffect(() => {
    // Get all strings matchin :A-Z in the query
    // This is a bit common SQL, I think

    // TODO when safari supports looking around, use the first line
    // https://caniuse.com/js-regexp-lookbehind
    // let toReplace = query.matchAll(/(?<!:):(?!:)[a-zA-Z]{1}[a-zA-Z0-9_]+/g);
    let toReplace = query.matchAll(/:[a-zA-Z_]+/g);

    let keys = new Set<string>();
    while (true) {
      let item = toReplace.next();
      if (!item.value) {
        break;
      }
      keys.add(item.value[0]);
    }
    let sortedKeys = Array.from(keys).sort();
    setReplaceList((oldList) =>
      sortedKeys.map((key) => {
        let value = oldList.find((it) => it.key === key)?.value || "";
        return { key, value };
      }),
    );
  }, [query]);

  const handleSubmit = (page: number, pageSize = 0) => {
    // Avoid fetch in the first render
    if (!query) {
      return;
    }

    setQueryParameter(SQL_QUERY, query);

    // Resets page if it's a new query
    if (query !== lastSearchedQuery) {
      page = 1;
      setPage(1);
    }
    setLastSearchedQuery(query);

    let finalQuery = "" + query;
    replaceList.forEach(
      (replaceItem) =>
        (finalQuery = finalQuery.replace(
          new RegExp(replaceItem.key, "g"),
          replaceItem.value,
        )),
    );

    setLoading(true);
    databaseQueryApi
      .queryDatabase(finalQuery, page - 1, pageSize)
      .then((response) => {
        let content = response.data.content;
        let headers = response.data.headers;

        setNoResult(content.length === 0);
        setHeaders(headers);
        setQueryResults(content);
        setTotalElements(response.data.totalElements);
      })
      .catch((e) => message.error(e.response?.data?.message || "Error"))
      .finally(() => setLoading(false));
  };

  const handlePaginationChange = (newPage: number, newSize?: number) => {
    if (newSize !== pageSize) {
      newPage = 1;
    }
    setPage(newPage);
    setPageSize((oldSize) => newSize || oldSize);

    handleSubmit(newPage, newSize);
  };

  const handleReplaceChange = (value: string, key: string) => {
    // We replace just the current value
    setReplaceList((oldList) =>
      oldList.map((it) => (it.key === key ? { key, value } : it)),
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // SQL submit with ctrl+enter
    if (e.key === "Enter" && e.ctrlKey && query.length) {
      handleSubmit(page, pageSize);
    }
  };

  const toggleInformationModal = () => setInformationOpen((f) => !f);

  return (
    <div id="database-query-wrapper">
      <h1 className="page-title">Database Query</h1>
      {metaData && (
        <div>
          <p>
            Results until {new Date(metaData.exportDate).toLocaleDateString()}
            &nbsp;
            <QuestionCircleOutlined onClick={toggleInformationModal} />
          </p>
          <Modal
            visible={informationOpen}
            onCancel={toggleInformationModal}
            footer={<Button onClick={toggleInformationModal}>Close</Button>}
            title="Information"
            width={(2.0 / 3) * window.innerWidth}
          >
            <div
              dangerouslySetInnerHTML={{
                __html: metaData.additionalInformation,
              }}
            />
          </Modal>
        </div>
      )}
      <Form onFinish={() => handleSubmit(page, pageSize)}>
        {/* <Form.Item
          rules={[{ required: true, message: "Please, provide a query" }]}
        >
          <TextArea
            data-testid="query-input"
            onChange={(evt) => setQuery(evt.target.value)}
            value={query}
            placeholder="Type your query here"
            rows={10}
            id="query-input"
            onKeyPress={handleKeyPress}
          />
        </Form.Item> */}
        <Form.Item
          rules={[{ required: true, message: "Please, provide a query" }]}
        >
          <CodeMirror
            value={query}
              sql({
                dialect: MySQL,
                schema: {
                  "Competitions": ["id", "name", "cityName", "countryId", "information", "venue", "venueAddress", "venueDetails", "external_website", "cellName", "showAtAll", "latitude", "longitude", "contact", "remarks", "registration_open", "registration_close", "use_wca_registration", "guests_enabled", "results_posted_at", "results_nag_sent_at", "generate_website", "announced_at", "base_entry_fee_lowest_denomination", "currency_code", "connected_stripe_account_id", "start_date", "end_date", "enable_donations", "competitor_limit_enabled", "competitor_limit", "competitor_limit_reason", "extra_registration_requirements", "on_the_spot_registration", "on_the_spot_entry_fee_lowest_denomination", "refund_policy_percent", "refund_policy_limit_date", "guests_entry_fee_lowest_denomination", "created_at", "updated_at", "results_submitted_at", "early_puzzle_submission", "early_puzzle_submission_reason", "qualification_results", "qualification_results_reason", "name_reason", "external_registration_page", "confirmed_at", "event_restrictions", "event_restrictions_reason", "registration_reminder_sent_at",],
                  "CompetitionsMedia": ["id", "competitionId", "type", "text", "uri", "submitterName", "submitterComment", "submitterEmail", "timestampSubmitted", "timestampDecided", "status"],
                  "ConciseAverageResults": ["id", "average", "valueAndId", "personId", "eventId", "countryId", "continentId", "year", "month", "day"],
                  "ConciseSingleResults": ["id", "best", "valueAndId", "personId", "eventId", "countryId", "continentId", "year", "month", "day"],
                  "Continents": ["id", "name", "recordName", "latitude", "longitude", "zoom"],
                  "Countries": ["id", "name", "continentId", "iso2"],
                  "Events": ["id", "name", "rank", "format", "cellName"],
                  "Formats": ["id", "name", "sort_by", "sort_by_second", "expected_solve_count", "trim_fastest_n", "trim_slowest_n"],
                  "InboxPersons": ["id", "wcaId", "name", "countryId", "gender", "dob", "competitionId"],
                  "InboxResults": ["id", "personId", "pos", "competitionId", "eventId", "roundTypeId", "formatId", "value1", "value2", "value3", "value4", "value5", "best", "average"],
                  "Persons": ["id", "wca_id", "subId", "name", "countryId", "gender", "dob", "comments", "incorrect_wca_id_claim_count"],
                  "RanksAverage": ["id", "personId", "eventId", "best", "worldRank", "continentRank", "countryRank"],
                  "RanksSingle": ["id", "personId", "eventId", "best", "worldRank", "continentRank", "countryRank"],
                  "Results": ["id", "pos", "personId", "personName", "countryId", "competitionId", "eventId", "roundTypeId", "formatId", "value1", "value2", "value3", "value4", "value5", "best", "average", "regionalSingleRecord", "regionalAverageRecord", "updated_at"],
                }
              }),
              EditorView.lineWrapping,
              Prec.highest(
                keymap.of([
                  {
                    key: "Mod-Enter", run: () => {
                      query.length && handleSubmit(page, pageSize);
                      return true;
                    }
                  }
                ])
              ),
            ]}
            id="query-input"
            onChange={(val) => setQuery(val)}
            indentWithTab
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
            }}
          />
        </Form.Item>
        {replaceList.map((replaceItem) => (
          <Input
            required
            data-testid="replace-item"
            className="replace-item"
            key={replaceItem.key}
            // Substring for removing the :
            addonBefore={replaceItem.key.substring(1)}
            onChange={(evt) =>
              handleReplaceChange(evt.target.value, replaceItem.key)
            }
          />
        ))}
        <Button
          data-testid="submit-button"
          htmlType="submit"
          type="primary"
          shape="round"
          size="large"
          disabled={!query || loading}
          title={!query ? "You need to provide an SQL query" : ""}
        >
          Submit
        </Button>
      </Form>
      {noResult && <NoContent />}

      {totalElements > 0 && (
        <>
          <Button
            type="primary"
            shape="round"
            size="small"
            className="options-button"
            onClick={toggleModal}
          >
            Options
          </Button>
          <DatabaseQueryOptions
            visible={modalOpen}
            onCancel={toggleModal}
            headers={headers}
            showPositions={showPositions}
            positionTieBreakerIndex={positionTieBreakerIndex}
            setShowPositions={setShowPositions}
            setPositionTieBreakerIndex={setPositionTieBreakerIndex}
          />
          {totalElements > pageSize && (
            <Pagination
              defaultPageSize={pageSize}
              current={page}
              total={totalElements}
              onChange={handlePaginationChange}
            />
          )}
        </>
      )}
      {loading && <Skeleton active />}
      {queryResults.length > 0 && !loading && (
        <StatisticsTable
          headers={headers}
          content={queryResults}
          page={page}
          pageSize={pageSize}
          allowInnerHTML={false}
          showPositions={showPositions}
          positionTieBreakerIndex={positionTieBreakerIndex}
        />
      )}
    </div>
  );
};
