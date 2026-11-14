%% OTP primitives only: no validation, credentials policy or release logic.
-module(ci_native).
-include_lib("kernel/include/file.hrl").
-export([arguments/0, env/1, set_env/2, unset_env/1, cwd/0, absolute/1,
         platform/0, read/1, write/2, append/2, mkdir/1, remove/1,
         rename/2, copy/2, regular/1, size/1, chmod/2, temp/1, nonce/0,
         sha256/1, read_line/0, stderr/1, stdout/1, halt/1, execute/5,
         archive_entries/1, archive_member/2, create_archive/2]).
text(X) -> unicode:characters_to_binary(X).
error_text(X) -> text(io_lib:format("~tp", [X])).
result(ok) -> {ok, nil};
result({ok, V}) -> {ok, V};
result({error, E}) -> {error, error_text(E)}.
arguments() ->
    io:setopts(standard_io, [{encoding, unicode}]),
    Args = init:get_plain_arguments(),
    UserArgs = try
        Script = filename:absname(escript:script_name()),
        case Args of
            ["--", First | Rest] -> case filename:absname(First) =:= Script of true -> Rest; false -> Args end;
            [First | Rest] -> case filename:absname(First) =:= Script of true -> Rest; false -> Args end;
            [] -> []
        end
    catch _:_ -> Args end,
    [text(X) || X <- UserArgs].
env(Name) -> case os:getenv(unicode:characters_to_list(Name)) of false -> <<>>; X -> text(X) end.
set_env(Name, Value) -> os:putenv(unicode:characters_to_list(Name), unicode:characters_to_list(Value)), nil.
unset_env(Name) -> os:unsetenv(unicode:characters_to_list(Name)), nil.
cwd() -> {ok, X} = file:get_cwd(), text(X).
absolute(X) -> text(filename:absname(X)).
platform() -> {_, X} = os:type(), atom_to_binary(X, utf8).
read(Path) -> result(file:read_file(Path)).
write(Path, Data) -> result(file:write_file(Path, Data)).
append(Path, Data) -> result(file:write_file(Path, Data, [append])).
mkdir(Path) -> result(filelib:ensure_dir(filename:join(Path, <<".directory">>))).
remove(Path) ->
    case file:read_link_info(Path) of
        {error, enoent} -> {ok, nil};
        {ok, #file_info{type=directory}} -> result(file:del_dir_r(Path));
        {ok, _} -> result(file:delete(Path));
        E -> result(E)
    end.
rename(A, B) -> result(file:rename(A, B)).
copy(A, B) -> case file:copy(A, B) of {ok, _} -> {ok, nil}; E -> result(E) end.
regular(Path) -> case file:read_link_info(Path) of {ok, #file_info{type=regular}} -> true; _ -> false end.
size(Path) -> case file:read_file_info(Path) of {ok, #file_info{size=N}} -> N; _ -> -1 end.
chmod(Path, Mode) -> result(file:change_mode(Path, Mode)).
nonce() ->
    {ok, _} = application:ensure_all_started(crypto),
    binary:encode_hex(crypto:strong_rand_bytes(16), lowercase).
temp(Prefix) ->
    Base = case os:getenv("TMPDIR") of false -> "/tmp"; Value -> Value end,
    Path = filename:join(text(Base), <<Prefix/binary, (nonce())/binary>>),
    case file:make_dir(Path) of
        ok -> case file:change_mode(Path, 8#700) of ok -> {ok, Path}; E -> result(E) end;
        E -> result(E)
    end.
sha256(Data) ->
    {ok, _} = application:ensure_all_started(crypto),
    binary:encode_hex(crypto:hash(sha256, Data), lowercase).
read_line() -> case io:get_line(standard_io, "") of eof -> {error, nil}; {error, _} -> {error, nil}; X -> {ok, text(X)} end.
stderr(X) -> io:put_chars(standard_error, X), nil.
stdout(X) -> io:put_chars(standard_io, X), nil.
halt(N) -> erlang:halt(N).
execute(Program, Args, Cwd, Stream, MergeStderr) ->
    case os:find_executable(unicode:characters_to_list(Program)) of
        false -> {127, <<"Executable unavailable: ", Program/binary>>};
        Executable ->
            try
                Errors = case MergeStderr of true -> [stderr_to_stdout]; false -> [] end,
                Port = open_port({spawn_executable, Executable}, [binary, exit_status, use_stdio,
                    {args, [unicode:characters_to_list(A) || A <- Args]}, {cd, unicode:characters_to_list(Cwd)} | Errors]),
                collect(Port, Stream, [], 0)
            catch _:Reason -> {127, error_text(Reason)} end
    end.
collect(Port, Stream, Chunks, Size) ->
    receive
        {Port, {data, Data}} when Size + byte_size(Data) =< 67108864 ->
            case Stream of true -> io:put_chars(standard_error, Data); false -> ok end,
            collect(Port, Stream, [Data | Chunks], Size + byte_size(Data));
        {Port, {data, _}} -> port_close(Port), {1, <<"Command output exceeded 64 MiB">>};
        {Port, {exit_status, Code}} -> {Code, iolist_to_binary(lists:reverse(Chunks))}
    after 7200000 -> port_close(Port), {124, <<"Command timeout">>}
    end.
archive_entries(Path) ->
    case erl_tar:table(unicode:characters_to_list(Path), [compressed, verbose]) of
        {ok, Rows} -> {ok, [{text(Name), atom_to_binary(Type, utf8), Size, Mode}
                           || {Name, Type, Size, _, Mode, _, _} <- Rows]};
        E -> result(E)
    end.
archive_member(Path, Name) ->
    case erl_tar:extract(unicode:characters_to_list(Path), [compressed, memory, {files, [unicode:characters_to_list(Name)]}]) of
        {ok, [{_, Data}]} -> {ok, Data};
        {ok, _} -> {error, <<"Missing archive member: ", Name/binary>>};
        E -> result(E)
    end.

create_archive(Path, Files) ->
    case erl_tar:open(unicode:characters_to_list(Path), [write, compressed]) of
        {ok, Tar} ->
            Written = try
                lists:foldl(fun
                    ({Name, Bytes, Mode}, ok) -> erl_tar:add(Tar, Bytes, unicode:characters_to_list(Name), [{mode, Mode}]);
                    (_, Error) -> Error
                end, ok, Files)
            catch _:Reason -> {error, Reason} end,
            Closed = erl_tar:close(Tar),
            case Written of ok -> result(Closed); Error -> result(Error) end;
        Error -> result(Error)
    end.
