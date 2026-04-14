# The Raft Consensus Algorithm

Raft is a consensus algorithm designed to be more understandable than
Paxos. It was introduced by Diego Ongaro and John Ousterhout in 2014
in a paper titled "In Search of an Understandable Consensus
Algorithm." Raft has become the consensus algorithm of choice for
many distributed systems including etcd, Consul, and TiKV.

## Leader Election

A Raft cluster has three server states: leader, follower, and
candidate. At any given time, exactly one server may be the leader.
Followers are passive and only respond to requests. When a follower
receives no communication over a period called the election timeout,
it becomes a candidate and starts an election by incrementing its
term and requesting votes from other servers.

## Log Replication

Once a leader is elected, it accepts client requests and replicates
log entries to followers. Each log entry contains a command and the
term in which it was received. An entry is considered committed once
a majority of servers have stored it durably. The leader applies
committed entries to its state machine and notifies followers.

## Safety

Raft guarantees that if any server has applied a particular log entry
to its state machine, then no other server will ever apply a
different command for the same log index. This is ensured by the
Leader Completeness Property: if a log entry is committed in a given
term, then that entry will be present in the logs of all
higher-numbered terms.

## Election Timeout

Raft uses randomized election timeouts, typically between 150 and 300
milliseconds, to ensure that split votes are rare and are resolved
quickly. The randomization makes it unlikely that two followers will
time out at the same moment, which would otherwise trigger competing
elections and prolong the unavailability window.
